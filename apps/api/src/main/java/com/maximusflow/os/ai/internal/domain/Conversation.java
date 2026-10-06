package com.maximusflow.os.ai.internal.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A chat thread. Messages live in SPRING_AI_CHAT_MEMORY keyed by this id; this row owns them. */
@Entity
@Table(name = "ai_conversation")
public class Conversation {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(nullable = false, length = 200)
	private String title;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Conversation() {
	}

	public Conversation(UUID userId, String title, Instant now) {
		this.userId = userId;
		this.title = title;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public void touch(Instant now) {
		this.updatedAt = now;
	}

	public void retitle(String title) {
		this.title = title;
	}

	public UUID getId() {
		return this.id;
	}

	public UUID getUserId() {
		return this.userId;
	}

	public String getTitle() {
		return this.title;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public Instant getUpdatedAt() {
		return this.updatedAt;
	}

}
