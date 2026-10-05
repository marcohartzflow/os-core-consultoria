package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.maximusflow.os.ai.internal.domain.Conversation;
import com.maximusflow.os.ai.internal.persistence.ConversationRepository;
import com.maximusflow.os.ai.internal.persistence.PendingActionRepository;
import com.maximusflow.os.common.audit.AuditQueryService;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.RequiresPermission;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.repository.jdbc.JdbcChatMemoryRepository;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Conversations belong to one person. Nobody else, administrators included, reads them. */
@Service
@Transactional
public class ConversationService {

	public record ConversationSummary(UUID id, String title, Instant createdAt, Instant updatedAt) {
		static ConversationSummary of(Conversation c) {
			return new ConversationSummary(c.getId(), c.getTitle(), c.getCreatedAt(), c.getUpdatedAt());
		}
	}

	/**
	 * What the assistant did in a turn, as the audit trail recorded it: {@code tool} (a tool ran),
	 * {@code failed} (with the reason class), {@code pending} (an action that asked for confirmation,
	 * with {@code action} as it stands now: still open, confirmed, refused, failed or expired) or
	 * {@code auto} (an action that ran without asking, with the {@code scope} the person had allowed).
	 */
	public record ToolStep(String kind, String tool, @Nullable String reason,
			PendingActionService.@Nullable PendingActionView action, @Nullable String scope) {
	}

	/** {@code steps}: for an assistant message, what the assistant did before answering; empty otherwise. */
	public record ChatMessage(String role, String text, List<ToolStep> steps) {
	}

	private static final List<String> STEP_ACTIONS = List.of("ai.tool.executed", "ai.tool.failed", "ai.action.parked",
			"ai.action.auto_allowed");

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ConversationRepository conversations;

	private final PendingActionRepository actions;

	private final ChatMemory chatMemory;

	private final CurrentUser currentUser;

	private final Clock clock;

	private final AuditQueryService auditTrail;

	ConversationService(ConversationRepository conversations, PendingActionRepository actions, ChatMemory chatMemory,
			CurrentUser currentUser, Clock clock, AuditQueryService auditTrail) {
		this.auditTrail = auditTrail;
		this.conversations = conversations;
		this.actions = actions;
		this.chatMemory = chatMemory;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional(readOnly = true)
	public List<ConversationSummary> mine() {
		return this.conversations.findByUserIdOrderByUpdatedAtDesc(this.currentUser.require().getId()).stream()
			.map(ConversationSummary::of).toList();
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public ConversationSummary create(String title) {
		Conversation conversation = this.conversations
			.save(new Conversation(this.currentUser.require().getId(), title, this.clock.instant()));
		return ConversationSummary.of(conversation);
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional(readOnly = true)
	public List<ChatMessage> messages(UUID conversationId) {
		requireOwned(conversationId);
		UUID me = this.currentUser.require().getId();
		List<Message> memory = this.chatMemory.get(conversationId.toString());
		// Only what the messages still in memory can show: the window starts at the oldest one.
		Instant since = memory.stream()
			.map((m) -> m.getMetadata().get(JdbcChatMemoryRepository.CONVERSATION_TS))
			.filter(Instant.class::isInstance)
			.map(Instant.class::cast)
			.findFirst()
			.orElse(null);
		if (since == null) {
			return visible(memory, this.actions.findNotesByConversationId(conversationId)).stream()
				.filter((m) -> !m.text().isBlank())
				.toList();
		}
		// The conversation is the person's (requireOwned), and only their own entries come back.
		List<AuditQueryService.CorrelatedEntry> trail = this.auditTrail.ownEntries(conversationId.toString(), me,
				STEP_ACTIONS, since);
		Map<String, PendingActionService.PendingActionView> actionsById = this.actions
			.findByConversationIdAndUserIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(conversationId, me, since)
			.stream()
			.collect(Collectors.toMap((a) -> a.getId().toString(), PendingActionService.PendingActionView::of));
		return visible(memory, this.actions.findNotesByConversationId(conversationId), trail, actionsById)
			.stream()
			.filter((m) -> !m.text().isBlank())
			.toList();
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public ConversationSummary rename(UUID conversationId, String title) {
		String clean = title.strip();
		if (clean.isEmpty() || clean.length() > 200) {
			throw new DomainRuleException("Nome vazio ou longo demais");
		}
		Conversation conversation = requireOwned(conversationId);
		conversation.retitle(clean);
		return ConversationSummary.of(conversation);
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public void delete(UUID conversationId) {
		Conversation conversation = requireOwned(conversationId);
		this.chatMemory.clear(conversationId.toString());
		this.conversations.delete(conversation);
	}

	/** Loads the conversation if it belongs to the current user; 404 otherwise (no existence leak). */
	public Conversation requireOwned(UUID conversationId) {
		return this.conversations.findByIdAndUserId(conversationId, this.currentUser.require().getId())
			.orElseThrow(() -> new NotFoundException("Conversa não encontrada"));
	}

	/**
	 * When the owned conversation ends with a note the portal added after a decision on actions,
	 * removes that note from the end of memory and returns it, so the turn that answers it sends it as
	 * its message (and the memory advisor stores it back once). Empty when the conversation ends with
	 * anything else: there is nothing to continue.
	 */
	public Optional<String> takePortalNote(UUID conversationId) {
		requireOwned(conversationId);
		String id = conversationId.toString();
		List<Message> memory = this.chatMemory.get(id);
		if (memory.isEmpty() || memory.getLast().getMessageType() != MessageType.USER) {
			return Optional.empty();
		}
		String last = textOf(memory.getLast());
		if (!Set.copyOf(this.actions.findNotesByConversationId(conversationId)).contains(last)) {
			return Optional.empty();
		}
		this.chatMemory.clear(id);
		this.chatMemory.add(id, memory.subList(0, memory.size() - 1));
		return Optional.of(last);
	}

	/** The conversation belongs to the current person (404 otherwise), checked before a turn is admitted. */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional(readOnly = true)
	public void checkOwned(UUID conversationId) {
		requireOwned(conversationId);
	}

	/**
	 * Marks the owned conversation as used now and gives it a title from the first message. Loads
	 * and changes the row inside this transaction: the agent runs outside one, and a detached entity
	 * would never be written back.
	 */
	public Conversation touch(UUID conversationId, String firstUserMessage) {
		Conversation conversation = requireOwned(conversationId);
		conversation.touch(this.clock.instant());
		if (conversation.getTitle().isBlank() && !firstUserMessage.isBlank()) {
			String title = firstUserMessage.strip();
			conversation.retitle(title.length() > 80 ? title.substring(0, 77) + "…" : title);
		}
		return conversation;
	}

	/**
	 * What the person sees and exports: their messages and the assistant's, without the notes the
	 * portal itself added (confirmation outcomes). Those notes are plain user-role messages, never
	 * system messages, so data can never gain system-prompt authority. Spring AI's JDBC chat memory
	 * persists only text, type and time, so a note is recognised by its exact text as recorded on the
	 * pending action, never by a prefix the person could type.
	 */
	static List<ChatMessage> visible(List<Message> memory, Collection<String> notes) {
		return visible(memory, notes, List.of(), Map.of());
	}

	/**
	 * As above, with each assistant message's steps: the trail entries between the person's message
	 * before it and the answer, by the times the JDBC chat memory keeps for every message.
	 */
	static List<ChatMessage> visible(List<Message> memory, Collection<String> notes,
			List<AuditQueryService.CorrelatedEntry> trail, Map<String, PendingActionService.PendingActionView> actions) {
		Set<String> portalNotes = Set.copyOf(notes);
		List<ChatMessage> result = new ArrayList<>();
		@Nullable Instant turnStart = null;
		for (Message m : memory) {
			Instant at = (m.getMetadata().get(JdbcChatMemoryRepository.CONVERSATION_TS) instanceof Instant i) ? i : null;
			if (m.getMessageType() == MessageType.USER) {
				turnStart = at;
				if (!portalNotes.contains(textOf(m))) {
					result.add(new ChatMessage(m.getMessageType().getValue(), textOf(m), List.of()));
				}
			}
			else if (m.getMessageType() == MessageType.ASSISTANT) {
				result.add(new ChatMessage(m.getMessageType().getValue(), textOf(m), steps(trail, actions, turnStart, at)));
			}
		}
		return result;
	}

	private static List<ToolStep> steps(List<AuditQueryService.CorrelatedEntry> trail,
			Map<String, PendingActionService.PendingActionView> actions, @Nullable Instant from, @Nullable Instant to) {
		if (from == null || to == null) {
			return List.of();
		}
		return trail.stream()
			.filter((e) -> e.occurredAt().isAfter(from) && !e.occurredAt().isAfter(to))
			.map((entry) -> step(entry, actions))
			.toList();
	}

	private static ToolStep step(AuditQueryService.CorrelatedEntry entry,
			Map<String, PendingActionService.PendingActionView> actions) {
		JsonNode details = details(entry.details());
		return switch (entry.action()) {
			case "ai.tool.failed" -> new ToolStep("failed", String.valueOf(entry.entityId()),
					details.path("reason").asString(null), null, null);
			case "ai.action.parked" -> new ToolStep("pending", details.path("tool").asString(""), null,
					actions.get(entry.entityId()), null);
			case "ai.action.auto_allowed" -> new ToolStep("auto", String.valueOf(entry.entityId()), null, null,
					details.path("scope").asString(null));
			default -> new ToolStep("tool", String.valueOf(entry.entityId()), null, null, null);
		};
	}

	private static JsonNode details(@Nullable String json) {
		try {
			return (json != null) ? JSON.readTree(json) : JSON.createObjectNode();
		}
		catch (JacksonException ex) {
			return JSON.createObjectNode();
		}
	}

	static String textOf(Message message) {
		String text = message.getText();
		return (text != null) ? text : "";
	}

}
