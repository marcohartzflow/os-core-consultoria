package com.maximusflow.os.iam.internal.persistence;

import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.UserMfa;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserMfaRepository extends JpaRepository<UserMfa, UUID> {

	boolean existsByUserIdAndEnabledAtIsNotNull(UUID userId);

}
