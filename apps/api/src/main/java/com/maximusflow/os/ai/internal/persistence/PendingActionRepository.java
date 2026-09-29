package com.maximusflow.os.ai.internal.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.PendingAction;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PendingActionRepository extends JpaRepository<PendingAction, UUID> {

	Optional<PendingAction> findByIdAndUserId(UUID id, UUID userId);

	List<PendingAction> findByConversationIdAndUserIdAndStatusOrderByCreatedAtAsc(UUID conversationId, UUID userId,
			PendingAction.Status status);

	/**
	 * Moves an open action to {@code to} in one statement, so concurrent confirmations of the same
	 * action cannot both win: the database serialises the update and only one caller sees 1 row.
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update PendingAction a set a.status = :to where a.id = :id and a.userId = :userId"
			+ " and a.status = :from and a.expiresAt > :now")
	int claim(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now,
			@Param("from") PendingAction.Status from, @Param("to") PendingAction.Status to);

}
