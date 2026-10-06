package com.maximusflow.os.iam.internal.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.internal.domain.AccountToken;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.AccountTokenRepository;

import org.springframework.stereotype.Component;

/** Issues and consumes single-use tokens. Raw token: 32 random bytes, base64url. Stored: SHA-256 hex. */
@Component
class AccountTokens {

	private final AccountTokenRepository repository;

	private final Clock clock;

	private final SecureRandom random = new SecureRandom();

	AccountTokens(AccountTokenRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	/** Deletes every outstanding link of the user (the account lost its access). */
	void revokeAll(User user) {
		this.repository.deleteByUser(user);
	}

	/** Invalidates previous tokens of the same type for the user and returns a new raw token. */
	String issue(User user, TokenType type, Duration ttl) {
		this.repository.deleteByUserAndType(user, type);
		byte[] bytes = new byte[32];
		this.random.nextBytes(bytes);
		String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		this.repository.save(new AccountToken(user, type, hash(raw), this.clock.instant().plus(ttl)));
		return raw;
	}

	/**
	 * Marks the token as used and returns it. Same error for unknown, used and expired tokens, and
	 * for the loser of two concurrent uses: the database decides who consumed it.
	 */
	AccountToken consume(String raw, TokenType type) {
		Instant now = this.clock.instant();
		AccountToken token = this.repository.findByTokenHashAndType(hash(raw), type)
			.filter((t) -> t.isUsable(now))
			.orElseThrow(() -> new DomainRuleException("Link inválido ou expirado"));
		if (this.repository.markUsed(token.getId(), now) != 1) {
			throw new DomainRuleException("Link inválido ou expirado");
		}
		token.markUsed(now);
		return token;
	}

	static String hash(String raw) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
