package com.maximusflow.os.iam.internal.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

/** One single-use recovery code, stored as a SHA-256 hash. */
@Entity
@Table(name = "user_mfa_recovery_code")
public class MfaRecoveryCode {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "code_hash", nullable = false, updatable = false, length = 64)
	private String codeHash;

	@Column(name = "used_at")
	private @Nullable Instant usedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected MfaRecoveryCode() {
	}

	public MfaRecoveryCode(UUID userId, String codeHash, Instant now) {
		this.userId = userId;
		this.codeHash = codeHash;
		this.createdAt = now;
	}

	public boolean use(Instant now) {
		if (this.usedAt != null) {
			return false;
		}
		this.usedAt = now;
		return true;
	}

	public boolean isUsed() {
		return this.usedAt != null;
	}

	public UUID getId() {
		return this.id;
	}

	public UUID getUserId() {
		return this.userId;
	}

}
