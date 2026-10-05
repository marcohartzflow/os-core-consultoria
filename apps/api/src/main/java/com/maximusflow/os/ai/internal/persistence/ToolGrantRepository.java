package com.maximusflow.os.ai.internal.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.ToolGrant;

import org.springframework.data.repository.ListCrudRepository;

public interface ToolGrantRepository extends ListCrudRepository<ToolGrant, UUID> {

	/** The person's settings: what holds in every conversation. */
	List<ToolGrant> findByUserIdAndConversationIdIsNull(UUID userId);

	/** What the person allowed in one conversation. */
	List<ToolGrant> findByUserIdAndConversationId(UUID userId, UUID conversationId);

	Optional<ToolGrant> findByUserIdAndToolNameAndConversationIdIsNull(UUID userId, String toolName);

	Optional<ToolGrant> findByUserIdAndToolNameAndConversationId(UUID userId, String toolName, UUID conversationId);

	List<ToolGrant> findByUserId(UUID userId);

	void deleteByUserId(UUID userId);

	/** Approvals of one call that were never used; returns how many were removed. */
	long deleteBySingleUseTrueAndExpiresAtBefore(Instant now);

}
