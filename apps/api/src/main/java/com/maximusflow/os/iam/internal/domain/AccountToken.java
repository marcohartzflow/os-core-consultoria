package com.maximusflow.os.iam.internal.domain;

import java.time.Instant;
import java.util.UUID;

import com.maximusflow.os.common.persistence.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.UuidGenerator;
import org.jspecify.annotations.Nullable;

/**
 * Single-use token sent to a person by e-mail (invitation or password reset). Only the SHA-256 of
 * the token is stored; the raw value exists only in the link.
 */
@Entity
@Table(name = "account_tokens")
public class AccountToken extends AuditableEntity {

	@Id
	// Time-ordered (v7): new rows land at the end of the primary key index instead of on random
	// pages, which keeps inserts cheap and the index compact as the table grows.
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private TokenType type;

	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "used_at")
	private @Nullable Instant usedAt;

	protected AccountToken() {
	}

	public AccountToken(User user, TokenType type, String tokenHash, Instant expiresAt) {
		this.user = user;
		this.type = type;
		this.tokenHash = tokenHash;
		this.expiresAt = expiresAt;
	}

	public boolean isUsable(Instant now) {
		return this.usedAt == null && this.expiresAt.isAfter(now);
	}

	public void markUsed(Instant now) {
		this.usedAt = now;
	}

	public UUID getId() {
		return this.id;
	}

	public User getUser() {
		return this.user;
	}

	public TokenType getType() {
		return this.type;
	}

	public Instant getExpiresAt() {
		return this.expiresAt;
	}

}
