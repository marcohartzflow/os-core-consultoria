package com.maximusflow.os.iam.internal.persistence;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.MfaRecoveryCode;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MfaRecoveryCodeRepository extends JpaRepository<MfaRecoveryCode, UUID> {

	List<MfaRecoveryCode> findByUserIdAndUsedAtIsNull(UUID userId);

	int countByUserIdAndUsedAtIsNull(UUID userId);

	/** Single use, decided by the database: only one of two concurrent attempts sees 1 row. */
	@Modifying(flushAutomatically = true)
	@Query("update MfaRecoveryCode c set c.usedAt = :now where c.id = :id and c.usedAt is null")
	int markUsed(@Param("id") UUID id, @Param("now") Instant now);

	void deleteByUserId(UUID userId);

}
