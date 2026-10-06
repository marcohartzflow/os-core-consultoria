package com.maximusflow.os.ai.internal.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.Conversation;
import com.maximusflow.os.ai.internal.domain.PendingAction;
import com.maximusflow.os.ai.internal.persistence.ConversationRepository;
import com.maximusflow.os.ai.internal.persistence.PendingActionRepository;
import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.stereotype.Component;

/**
 * The person's conversations with the assistant, messages included, and the actions the assistant
 * proposed in them (tool, arguments as the model wrote them, what happened and when). The tool's
 * result and the portal's note to the model are left out: the result is data the tool read, often
 * about other people, and the note is an internal sentence. Erased entirely; the pending actions go
 * with their conversation (ON DELETE CASCADE, V5).
 */
@Component
class ConversationsDataContributor implements PersonalDataContributor {

	record ConversationExport(UUID id, String title, Instant createdAt, Instant updatedAt,
			List<ConversationService.ChatMessage> messages, List<ActionExport> actions) {
	}

	record ActionExport(UUID id, String tool, String summary, String arguments, PendingAction.Status status,
			Instant createdAt, Instant expiresAt, @Nullable Instant resolvedAt) {

		static ActionExport of(PendingAction action) {
			return new ActionExport(action.getId(), action.getToolName(), action.getSummary(), action.getArguments(),
					action.getStatus(), action.getCreatedAt(), action.getExpiresAt(), action.getResolvedAt());
		}

	}

	private final ConversationRepository conversations;

	private final PendingActionRepository actions;

	private final ChatMemory chatMemory;

	ConversationsDataContributor(ConversationRepository conversations, PendingActionRepository actions,
			ChatMemory chatMemory) {
		this.conversations = conversations;
		this.actions = actions;
		this.chatMemory = chatMemory;
	}

	@Override
	public String key() {
		return "conversations";
	}

	@Override
	public List<ConversationExport> export(UUID userId, String email) {
		return this.conversations.findByUserIdOrderByUpdatedAtDesc(userId).stream().map(this::export).toList();
	}

	@Override
	public void erase(UUID userId, String email) {
		for (Conversation conversation : this.conversations.findByUserIdOrderByUpdatedAtDesc(userId)) {
			this.chatMemory.clear(conversation.getId().toString());
			this.conversations.delete(conversation);
		}
	}

	private ConversationExport export(Conversation conversation) {
		List<ConversationService.ChatMessage> messages = ConversationService.visible(
				this.chatMemory.get(conversation.getId().toString()),
				this.actions.findNotesByConversationId(conversation.getId()));
		List<ActionExport> proposed = this.actions
			.findByConversationIdAndUserIdOrderByCreatedAtAsc(conversation.getId(), conversation.getUserId())
			.stream()
			.map(ActionExport::of)
			.toList();
		return new ConversationExport(conversation.getId(), conversation.getTitle(), conversation.getCreatedAt(),
				conversation.getUpdatedAt(), messages, proposed);
	}


}
