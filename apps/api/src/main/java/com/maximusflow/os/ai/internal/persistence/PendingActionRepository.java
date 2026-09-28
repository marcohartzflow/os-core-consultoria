package com.maximusflow.os.ai.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.PendingAction;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PendingActionRepository extends JpaRepository<PendingAction, UUID> {

	Optional<PendingAction> findByIdAndUserId(UUID id, UUID userId);

	List<PendingAction> findByConversationIdAndUserIdAndStatusOrderByCreatedAtAsc(UUID conversationId, UUID userId,
			PendingAction.Status status);

}
