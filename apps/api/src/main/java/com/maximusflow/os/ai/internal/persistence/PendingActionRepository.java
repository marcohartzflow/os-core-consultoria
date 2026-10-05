package com.maximusflow.os.ai.internal.persistence;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.PendingAction;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PendingActionRepository extends JpaRepository<PendingAction, UUID> {

	Optional<PendingAction> findByIdAndUserId(UUID id, UUID userId);

	List<PendingAction> findByConversationIdAndUserIdAndStatusOrderByCreatedAtAsc(UUID conversationId, UUID userId,
			PendingAction.Status status);

	List<PendingAction> findByConversationIdAndUserIdOrderByCreatedAtAsc(UUID conversationId, UUID userId);

	List<PendingAction> findByConversationIdAndUserIdAndCreatedAtGreaterThanEqualOrderByCreatedAtAsc(
			UUID conversationId, UUID userId, Instant since);

	/** The notes the portal added to the conversation about resolved actions. */
	@Query("select a.note from PendingAction a where a.conversationId = :conversationId and a.note is not null")
	List<String> findNotesByConversationId(@Param("conversationId") UUID conversationId);

	/**
	 * Moves an open action to {@code to} in one statement, so concurrent confirmations of the same
	 * action cannot both win: the database serialises the update and only one caller sees 1 row.
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update PendingAction a set a.status = :to where a.id = :id and a.userId = :userId"
			+ " and a.status = :from and a.expiresAt > :now")
	int claim(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now,
			@Param("from") PendingAction.Status from, @Param("to") PendingAction.Status to);

	/**
	 * Marks an overdue action EXPIRED in one statement. Only a PENDING action past its time moves, so
	 * the lazy path (a confirmation that arrives late) and the scheduled job never both expire it, and
	 * one being confirmed (already EXECUTING) is left alone.
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update PendingAction a set a.status = com.maximusflow.os.ai.internal.domain.PendingAction.Status.EXPIRED,"
			+ " a.resolvedAt = :now where a.id = :id"
			+ " and a.status = com.maximusflow.os.ai.internal.domain.PendingAction.Status.PENDING"
			+ " and a.expiresAt <= :now")
	int expire(@Param("id") UUID id, @Param("now") Instant now);

	/** Ids of PENDING actions whose time ran out, oldest first, at most {@code limit}. */
	@Query("select a.id from PendingAction a"
			+ " where a.status = com.maximusflow.os.ai.internal.domain.PendingAction.Status.PENDING"
			+ " and a.expiresAt <= :now order by a.expiresAt")
	List<UUID> findOverdue(@Param("now") Instant now, Limit limit);

	/** Deletes resolved actions older than {@code before} that left no note in their conversation. */
	@Modifying
	@Query("delete from PendingAction a where a.status in :resolved and a.resolvedAt < :before and a.note is null")
	int deleteResolvedBefore(@Param("resolved") Collection<PendingAction.Status> resolved,
			@Param("before") Instant before);

	/**
	 * Drops arguments and result of resolved actions older than {@code before} whose note is still
	 * needed: the note is how the conversation tells the portal's sentence apart from what the person
	 * typed ({@code ConversationService.visible}), so the row stays, emptied, until the conversation is
	 * deleted (ON DELETE CASCADE).
	 */
	@Modifying
	@Query("update PendingAction a set a.arguments = '', a.result = null where a.status in :resolved"
			+ " and a.resolvedAt < :before and a.note is not null and (a.arguments <> '' or a.result is not null)")
	int scrubResolvedBefore(@Param("resolved") Collection<PendingAction.Status> resolved,
			@Param("before") Instant before);

}
