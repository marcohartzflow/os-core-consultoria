package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonRawValue;

import io.swagger.v3.oas.annotations.media.Schema;

import org.jspecify.annotations.Nullable;

/** Read model of one audit entry. {@code details} is the stored JSON document, emitted as-is. */
public record AuditEventView(UUID id, Instant occurredAt, @Nullable UUID actorId, @Nullable String actorEmail,
		AuditOrigin origin, String action, @Nullable String entityType, @Nullable String entityId,
		@JsonRawValue @Schema(implementation = Object.class, description = "JSON document with the action details") @Nullable String details, @Nullable String ip, @Nullable String correlationId) {

	static AuditEventView of(AuditEvent event) {
		return new AuditEventView(event.getId(), event.getOccurredAt(), event.getActorId(), event.getActorEmail(),
				event.getOrigin(), event.getAction(), event.getEntityType(), event.getEntityId(), event.getDetails(),
				event.getIp(), event.getCorrelationId());
	}

}
