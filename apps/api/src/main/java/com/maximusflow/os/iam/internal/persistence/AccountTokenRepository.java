package com.maximusflow.os.iam.internal.persistence;

import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.AccountToken;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountTokenRepository extends JpaRepository<AccountToken, UUID> {

	Optional<AccountToken> findByTokenHashAndType(String tokenHash, TokenType type);

	void deleteByUserAndType(User user, TokenType type);

}
