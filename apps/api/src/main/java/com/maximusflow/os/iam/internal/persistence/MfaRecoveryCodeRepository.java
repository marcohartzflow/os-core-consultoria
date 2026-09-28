package com.maximusflow.os.iam.internal.persistence;

import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.MfaRecoveryCode;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MfaRecoveryCodeRepository extends JpaRepository<MfaRecoveryCode, UUID> {

	Optional<MfaRecoveryCode> findByUserIdAndCodeHash(UUID userId, String codeHash);

	int countByUserIdAndUsedAtIsNull(UUID userId);

	void deleteByUserId(UUID userId);

}
