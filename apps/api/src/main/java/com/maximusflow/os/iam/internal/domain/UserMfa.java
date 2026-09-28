package com.maximusflow.os.iam.internal.domain;

import java.time.Instant;
import java.util.UUID;

import com.maximusflow.os.common.persistence.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

/** TOTP enrolment of one user. Pending until {@code enabledAt} is set by a first valid code. */
@Entity
@Table(name = "user_mfa")
public class UserMfa extends AuditableEntity {

	@Id
	@Column(name = "user_id")
	private UUID userId;

	/** Encrypted TOTP secret (AES-GCM, Base64). */
	@Column(nullable = false)
	private String secret;

	@Column(name = "enabled_at")
	private @Nullable Instant enabledAt;

	/** Last accepted time step, so a code cannot be replayed inside its validity window. */
	@Column(name = "last_used_step")
	private @Nullable Long lastUsedStep;

	protected UserMfa() {
	}

	public UserMfa(UUID userId, String encryptedSecret) {
		this.userId = userId;
		this.secret = encryptedSecret;
	}

	public void replaceSecret(String encryptedSecret) {
		this.secret = encryptedSecret;
		this.enabledAt = null;
		this.lastUsedStep = null;
	}

	public void enable(Instant now, long step) {
		this.enabledAt = now;
		this.lastUsedStep = step;
	}

	public void markUsed(long step) {
		this.lastUsedStep = step;
	}

	public boolean isEnabled() {
		return this.enabledAt != null;
	}

	public UUID getUserId() {
		return this.userId;
	}

	public String getSecret() {
		return this.secret;
	}

	public @Nullable Instant getEnabledAt() {
		return this.enabledAt;
	}

	public @Nullable Long getLastUsedStep() {
		return this.lastUsedStep;
	}

}
