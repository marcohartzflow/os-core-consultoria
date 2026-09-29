package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.Conversation;
import com.maximusflow.os.ai.internal.persistence.ConversationRepository;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.RequiresPermission;

import org.springframework.ai.chat.memory.ChatMemory;
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

	public record ChatMessage(String role, String text) {
	}

	private final ConversationRepository conversations;

	private final ChatMemory chatMemory;

	private final CurrentUser currentUser;

	private final Clock clock;

	ConversationService(ConversationRepository conversations, ChatMemory chatMemory, CurrentUser currentUser,
			Clock clock) {
		this.conversations = conversations;
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
		return this.chatMemory.get(conversationId.toString()).stream()
			.filter((m) -> m.getMessageType() == MessageType.USER || m.getMessageType() == MessageType.ASSISTANT)
			.filter((m) -> !isPortalNote(m))
			.map((m) -> new ChatMessage(m.getMessageType().getValue(), textOf(m)))
			.filter((m) -> !m.text().isBlank())
			.toList();
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
	 * Marks the owned conversation as used now and gives it a title from the first message. Loads
	 * and changes the row inside this transaction: the agent runs outside one, and a detached entity
	 * would never be written back.
	 */
	public Conversation touch(UUID conversationId, String firstUserMessage) {
		Conversation conversation = requireOwned(conversationId);
		conversation.touch(this.clock.instant());
		if (conversation.getTitle().isBlank()) {
			String title = firstUserMessage.strip();
			conversation.retitle(title.length() > 80 ? title.substring(0, 77) + "…" : title);
		}
		return conversation;
	}

	/**
	 * Prefix of the notes the portal itself adds to a conversation (confirmation outcomes). They are
	 * plain user-role messages, never system messages, so data can never gain system-prompt
	 * authority; the prefix keeps them out of what people see and export.
	 */
	public static final String PORTAL_NOTE = "[portal] ";

	public static boolean isPortalNote(Message message) {
		String text = message.getText();
		return message.getMessageType() == MessageType.USER && text != null && text.startsWith(PORTAL_NOTE);
	}

	private static String textOf(Message message) {
		String text = message.getText();
		return (text != null) ? text : "";
	}

}
