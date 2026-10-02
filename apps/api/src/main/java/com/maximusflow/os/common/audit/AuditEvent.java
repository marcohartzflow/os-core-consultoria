package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * Append-only business audit trail (LGPD art. 37, ASVS V16). Rows are never updated or deleted by
 * the application; the database role used at runtime must only have INSERT and SELECT on this
 * table.
 */
@Entity
// Append-only: Hibernate keeps no snapshot for dirty checking and never issues an UPDATE.
@Immutable
@Table(name = "audit_event")
public class AuditEvent {

	@Id
	// Time-ordered (v7): new rows land at the end of the primary key index instead of on random
	// pages, which keeps inserts cheap and the index compact as the table grows.
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	@Column(name = "occurred_at", nullable = false, updatable = false)
	private Instant occurredAt;

	@Column(name = "actor_id", updatable = false)
	private @Nullable UUID actorId;

	@Column(name = "actor_email", updatable = false, length = 320)
	private @Nullable String actorEmail;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false, length = 20)
	private AuditOrigin origin;

	@Column(nullable = false, updatable = false, length = 100)
	private String action;

	@Column(name = "entity_type", updatable = false, length = 100)
	private @Nullable String entityType;

	@Column(name = "entity_id", updatable = false, length = 100)
	private @Nullable String entityId;

	/** JSON document, serialized by {@link AuditRecorder}. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(updatable = false)
	private @Nullable String details;

	@Column(updatable = false, length = 64)
	private @Nullable String ip;

	@Column(name = "correlation_id", updatable = false, length = 100)
	private @Nullable String correlationId;

	protected AuditEvent() {
	}

	AuditEvent(Instant occurredAt, @Nullable UUID actorId, @Nullable String actorEmail, AuditOrigin origin,
			String action, @Nullable String entityType, @Nullable String entityId, @Nullable String details,
			@Nullable String ip, @Nullable String correlationId) {
		this.occurredAt = occurredAt;
		this.actorId = actorId;
		this.actorEmail = actorEmail;
		this.origin = origin;
		this.action = action;
		this.entityType = entityType;
		this.entityId = entityId;
		this.details = details;
		this.ip = ip;
		this.correlationId = correlationId;
	}

	public UUID getId() {
		return this.id;
	}

	public Instant getOccurredAt() {
		return this.occurredAt;
	}

	public @Nullable UUID getActorId() {
		return this.actorId;
	}

	public @Nullable String getActorEmail() {
		return this.actorEmail;
	}

	public AuditOrigin getOrigin() {
		return this.origin;
	}

	public String getAction() {
		return this.action;
	}

	public @Nullable String getEntityType() {
		return this.entityType;
	}

	public @Nullable String getEntityId() {
		return this.entityId;
	}

	public @Nullable String getDetails() {
		return this.details;
	}

	public @Nullable String getIp() {
		return this.ip;
	}

	public @Nullable String getCorrelationId() {
		return this.correlationId;
	}

}
