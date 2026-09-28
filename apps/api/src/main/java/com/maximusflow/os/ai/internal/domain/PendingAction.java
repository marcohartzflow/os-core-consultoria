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
 * A destructive tool call the agent wanted to make. It only runs after the owner confirms it, and only
 * until it expires.
 */
@Entity
@Table(name = "ai_pending_action")
public class PendingAction {

	public enum Status {

		PENDING, CONFIRMED, REJECTED, EXPIRED, FAILED

	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "conversation_id", nullable = false, updatable = false)
	private UUID conversationId;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "tool_name", nullable = false, updatable = false, length = 150)
	private String toolName;

	@Column(nullable = false, updatable = false, length = 300)
	private String summary;

	@Column(nullable = false, updatable = false, columnDefinition = "text")
	private String arguments;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Status status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false, updatable = false)
	private Instant expiresAt;

	@Column(name = "resolved_at")
	private @Nullable Instant resolvedAt;

	@Column(columnDefinition = "text")
	private @Nullable String result;

	protected PendingAction() {
	}

	public PendingAction(UUID conversationId, UUID userId, String toolName, String summary, String arguments,
			Instant now, Instant expiresAt) {
		this.conversationId = conversationId;
		this.userId = userId;
		this.toolName = toolName;
		this.summary = summary;
		this.arguments = arguments;
		this.status = Status.PENDING;
		this.createdAt = now;
		this.expiresAt = expiresAt;
	}

	public boolean isOpen(Instant now) {
		return this.status == Status.PENDING && this.expiresAt.isAfter(now);
	}

	public void resolve(Status status, @Nullable String result, Instant now) {
		this.status = status;
		this.result = result;
		this.resolvedAt = now;
	}

	public UUID getId() {
		return this.id;
	}

	public UUID getConversationId() {
		return this.conversationId;
	}

	public UUID getUserId() {
		return this.userId;
	}

	public String getToolName() {
		return this.toolName;
	}

	public String getSummary() {
		return this.summary;
	}

	public String getArguments() {
		return this.arguments;
	}

	public Status getStatus() {
		return this.status;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public Instant getExpiresAt() {
		return this.expiresAt;
	}

	public @Nullable Instant getResolvedAt() {
		return this.resolvedAt;
	}

	public @Nullable String getResult() {
		return this.result;
	}

}
