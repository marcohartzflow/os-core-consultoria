package com.maximusflow.os.ai.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.Conversation;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

	List<Conversation> findByUserIdOrderByUpdatedAtDesc(UUID userId);

	Optional<Conversation> findByIdAndUserId(UUID id, UUID userId);

}
