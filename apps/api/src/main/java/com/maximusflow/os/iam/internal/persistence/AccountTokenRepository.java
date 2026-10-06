package com.maximusflow.os.iam.internal.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.AccountToken;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountTokenRepository extends JpaRepository<AccountToken, UUID> {

	Optional<AccountToken> findByTokenHashAndType(String tokenHash, TokenType type);

	/** Single use, decided by the database: only one of two concurrent consumers sees 1 row. */
	@Modifying(flushAutomatically = true)
	@Query("update AccountToken t set t.usedAt = :now where t.id = :id and t.usedAt is null")
	int markUsed(@Param("id") UUID id, @Param("now") Instant now);

	void deleteByUserAndType(User user, TokenType type);

	void deleteByUser(User user);

	/** Used or expired links are of no further use to anyone (LGPD art. 16: kept no longer than needed). */
	@Modifying
	@Query("delete from AccountToken t where t.usedAt is not null or t.expiresAt < :now")
	int deleteSpent(@Param("now") Instant now);

}
