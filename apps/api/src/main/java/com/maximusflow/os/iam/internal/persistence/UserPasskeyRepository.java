package com.maximusflow.os.iam.internal.persistence;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.UserPasskey;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPasskeyRepository extends JpaRepository<UserPasskey, String> {

	List<UserPasskey> findByUserId(UUID userId);

	int countByUserId(UUID userId);

}
