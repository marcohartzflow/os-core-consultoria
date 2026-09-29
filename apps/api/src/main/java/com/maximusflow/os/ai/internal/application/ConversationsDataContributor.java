package com.maximusflow.os.ai.internal.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.Conversation;
import com.maximusflow.os.ai.internal.persistence.ConversationRepository;
import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.stereotype.Component;

/** The person's conversations with the assistant, messages included. Erased entirely. */
@Component
class ConversationsDataContributor implements PersonalDataContributor {

	record ConversationExport(UUID id, String title, Instant createdAt, Instant updatedAt,
			List<ConversationService.ChatMessage> messages) {
	}

	private final ConversationRepository conversations;

	private final ChatMemory chatMemory;

	ConversationsDataContributor(ConversationRepository conversations, ChatMemory chatMemory) {
		this.conversations = conversations;
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
		List<ConversationService.ChatMessage> messages = this.chatMemory.get(conversation.getId().toString())
			.stream()
			.filter((m) -> m.getMessageType() == MessageType.USER || m.getMessageType() == MessageType.ASSISTANT)
			.filter((m) -> !ConversationService.isPortalNote(m))
			.map((m) -> new ConversationService.ChatMessage(m.getMessageType().getValue(), textOf(m)))
			.toList();
		return new ConversationExport(conversation.getId(), conversation.getTitle(), conversation.getCreatedAt(),
				conversation.getUpdatedAt(), messages);
	}

	private static String textOf(Message message) {
		String text = message.getText();
		return (text != null) ? text : "";
	}

}
