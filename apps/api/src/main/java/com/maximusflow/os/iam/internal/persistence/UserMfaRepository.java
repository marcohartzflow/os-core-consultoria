package com.maximusflow.os.iam.internal.persistence;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.UserMfa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserMfaRepository extends JpaRepository<UserMfa, UUID> {

	boolean existsByUserIdAndEnabledAtIsNotNull(UUID userId);

	/**
	 * Users with a second factor: a confirmed authenticator app or at least one passkey. The user list
	 * shows it without one query per row.
	 */
	@Query("select u.id from User u where " + HAS_SECOND_FACTOR)
	Set<UUID> findUserIdsWithMfaEnabled();

	@Query("select u.id from User u where u.id in :ids and (" + HAS_SECOND_FACTOR + ")")
	Set<UUID> findUserIdsWithMfaEnabled(@Param("ids") Collection<UUID> ids);

	@Query("select count(u) > 0 from User u where u.id = :userId and (" + HAS_SECOND_FACTOR + ")")
	boolean hasSecondFactor(@Param("userId") UUID userId);

	/** JPQL condition on {@code u} (a User): authenticator app confirmed, or a passkey registered. */
	String HAS_SECOND_FACTOR = "exists (select 1 from UserMfa m where m.userId = u.id and m.enabledAt is not null)"
			+ " or exists (select 1 from UserPasskey p where p.userId = u.id)";

	/**
	 * Records the TOTP step that was just accepted, only if it is newer than the last one: two
	 * concurrent logins with the same code cannot both pass.
	 */
	@Modifying(flushAutomatically = true)
	@Query("update UserMfa m set m.lastUsedStep = :step where m.userId = :userId"
			+ " and (m.lastUsedStep is null or m.lastUsedStep < :step)")
	int claimStep(@Param("userId") UUID userId, @Param("step") long step);

}
