package com.maximusflow.os.iam.internal.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Links a passkey stored by Spring Security ({@code user_credentials}) to the account that registered
 * it. The credential itself (public key, counters) is only ever read and written by Spring Security.
 */
@Entity
@Table(name = "user_passkey")
public class UserPasskey {

	@Id
	@Column(name = "credential_id")
	private String credentialId;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected UserPasskey() {
	}

	public UserPasskey(String credentialId, UUID userId, Instant createdAt) {
		this.credentialId = credentialId;
		this.userId = userId;
		this.createdAt = createdAt;
	}

	public String getCredentialId() {
		return this.credentialId;
	}

	public UUID getUserId() {
		return this.userId;
	}

}
