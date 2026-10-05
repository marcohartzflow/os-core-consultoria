package com.maximusflow.os.ai.internal.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

/**
 * What a person chose for one assistant tool: run it without asking ({@code ALLOW}), for one
 * conversation or always; ask first even for a read ({@code ASK}); or keep it away from the agent
 * ({@code BLOCK}). No grant means the default: a read runs, an action asks. A {@code singleUse} grant
 * lets one call through and is gone (the approval of a read, which the assistant then makes again).
 */
@Entity
@Table(name = "ai_tool_grant")
public class ToolGrant {

	public enum Mode {

		ALLOW, ASK, BLOCK

	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "tool_name", nullable = false, updatable = false, length = 150)
	private String toolName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private Mode mode;

	@Column(name = "conversation_id", updatable = false)
	private @Nullable UUID conversationId;

	@Column(name = "expires_at")
	private @Nullable Instant expiresAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "last_used_at")
	private @Nullable Instant lastUsedAt;

	@Column(name = "single_use", nullable = false)
	private boolean singleUse;

	/** For a single-use grant: the call it lets through (SHA-256 of the canonical arguments). */
	@Column(name = "arguments_sha256", length = 64)
	private @Nullable String argumentsSha256;

	protected ToolGrant() {
	}

	public ToolGrant(UUID userId, String toolName, Mode mode, @Nullable UUID conversationId,
			@Nullable Instant expiresAt, Instant now) {
		this.userId = userId;
		this.toolName = toolName;
		this.mode = mode;
		this.conversationId = conversationId;
		this.expiresAt = expiresAt;
		this.createdAt = now;
	}

	/** One call through (the one with these arguments), then gone. */
	public static ToolGrant singleUse(UUID userId, String toolName, UUID conversationId, String argumentsSha256,
			Instant expiresAt, Instant now) {
		ToolGrant grant = new ToolGrant(userId, toolName, Mode.ALLOW, conversationId, expiresAt, now);
		grant.singleUse = true;
		grant.argumentsSha256 = argumentsSha256;
		return grant;
	}

	/** The same row, now letting one call through: the one with these arguments. */
	public void renewSingleUse(String argumentsSha256, Instant expiresAt, Instant now) {
		renew(Mode.ALLOW, expiresAt, now);
		this.singleUse = true;
		this.argumentsSha256 = argumentsSha256;
	}

	public boolean isSingleUse() {
		return this.singleUse;
	}

	/** Whether this single-use grant lets this call through. */
	public boolean letsThrough(String argumentsSha256) {
		return argumentsSha256.equals(this.argumentsSha256);
	}

	public boolean isActive(Instant now) {
		return this.expiresAt == null || this.expiresAt.isAfter(now);
	}

	/** Grants anew: the same row takes the new mode and validity, as if it had been created now. */
	public void renew(Mode mode, @Nullable Instant expiresAt, Instant now) {
		this.mode = mode;
		this.expiresAt = expiresAt;
		this.createdAt = now;
		this.lastUsedAt = null;
		this.singleUse = false;
		this.argumentsSha256 = null;
	}

	public void used(Instant now) {
		this.lastUsedAt = now;
	}

	public UUID getId() {
		return this.id;
	}

	public UUID getUserId() {
		return this.userId;
	}

	public String getToolName() {
		return this.toolName;
	}

	public Mode getMode() {
		return this.mode;
	}

	public @Nullable UUID getConversationId() {
		return this.conversationId;
	}

	public @Nullable Instant getExpiresAt() {
		return this.expiresAt;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public @Nullable Instant getLastUsedAt() {
		return this.lastUsedAt;
	}

}
