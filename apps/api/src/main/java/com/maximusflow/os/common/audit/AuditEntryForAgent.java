package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonRawValue;

import org.jspecify.annotations.Nullable;

/**
 * One audit entry as the agent receives it from {@code audit_search}. The same as
 * {@link AuditEventView} without the IP address: answering "who did what and when" needs the actor,
 * not where they connected from, and what a tool returns goes to the model provider (LGPD art. 6 III,
 * necessity; OWASP LLM02). The REST trail and its CSV export keep the IP for the people who
 * investigate. The actor's e-mail stays: it is how a person is named in the answer.
 */
public record AuditEntryForAgent(UUID id, Instant occurredAt, @Nullable UUID actorId, @Nullable String actorEmail,
		AuditOrigin origin, String action, @Nullable String entityType, @Nullable String entityId,
		@JsonRawValue @Nullable String details, @Nullable String correlationId) {

	static AuditEntryForAgent of(AuditEvent event) {
		return new AuditEntryForAgent(event.getId(), event.getOccurredAt(), event.getActorId(), event.getActorEmail(),
				event.getOrigin(), event.getAction(), event.getEntityType(), event.getEntityId(), event.getDetails(),
				event.getCorrelationId());
	}

}
