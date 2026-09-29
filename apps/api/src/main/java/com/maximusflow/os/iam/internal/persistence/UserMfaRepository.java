package com.maximusflow.os.iam.internal.persistence;

import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.UserMfa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserMfaRepository extends JpaRepository<UserMfa, UUID> {

	boolean existsByUserIdAndEnabledAtIsNotNull(UUID userId);

	/**
	 * Records the TOTP step that was just accepted, only if it is newer than the last one: two
	 * concurrent logins with the same code cannot both pass.
	 */
	@Modifying(flushAutomatically = true)
	@Query("update UserMfa m set m.lastUsedStep = :step where m.userId = :userId"
			+ " and (m.lastUsedStep is null or m.lastUsedStep < :step)")
	int claimStep(@Param("userId") UUID userId, @Param("step") long step);

}
