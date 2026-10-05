package com.maximusflow.os.ai.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.Conversation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

	List<Conversation> findByUserIdOrderByUpdatedAtDesc(UUID userId);

	Optional<Conversation> findByIdAndUserId(UUID id, UUID userId);

	/**
	 * Chat memory whose conversation no longer exists. The memory table has no foreign key (Spring AI
	 * owns its schema, keyed by a string), so a conversation removed outside {@code ConversationService}
	 * (a user row deleted in the database cascades to {@code ai_conversation}) would leave it behind.
	 */
	@Modifying
	@Query(value = """
			DELETE FROM spring_ai_chat_memory m
			WHERE NOT EXISTS (SELECT 1 FROM ai_conversation c WHERE c.id::text = m.conversation_id)""",
			nativeQuery = true)
	int deleteOrphanMemory();

}
