package com.maximusflow.os.common.audit;

import java.time.Clock;
import java.util.Map;

import com.maximusflow.os.common.security.CurrentUser;

import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.ObjectMapper;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Writes entries to the business audit trail. Joins the caller's transaction so an audited action and
 * its audit row commit or roll back together. Origin and correlation come from {@link AuditContext}
 * when a scope is open (AI tool execution), otherwise from the presence of an HTTP request.
 */
@Component
public class AuditRecorder {

	private final AuditEventRepository repository;

	private final CurrentUser currentUser;

	private final ObjectMapper json;

	private final Clock clock;

	AuditRecorder(AuditEventRepository repository, CurrentUser currentUser, ObjectMapper json, Clock clock) {
		this.repository = repository;
		this.currentUser = currentUser;
		this.json = json;
		this.clock = clock;
	}

	/** Records an action performed by the current user. */
	@Transactional
	public void record(String action, @Nullable String entityType, @Nullable String entityId,
			@Nullable Map<String, ?> details) {
		var actor = this.currentUser.get().orElse(null);
		this.repository.save(new AuditEvent(this.clock.instant(), (actor != null) ? actor.getId() : null,
				(actor != null) ? actor.getEmail() : null, origin(), action, entityType, entityId, serialize(details),
				ip(), correlation()));
	}

	/** Records an action for which there is no authenticated user, e.g. a failed login. */
	@Transactional
	public void recordAnonymous(String action, @Nullable String subjectEmail, @Nullable String entityType,
			@Nullable String entityId, @Nullable Map<String, ?> details) {
		this.repository.save(new AuditEvent(this.clock.instant(), null, subjectEmail, origin(), action, entityType,
				entityId, serialize(details), ip(), correlation()));
	}

	/** Records an action performed by the system itself (bootstrap, jobs). */
	@Transactional
	public void recordSystem(String action, @Nullable String entityType, @Nullable String entityId,
			@Nullable Map<String, ?> details) {
		this.repository.save(new AuditEvent(this.clock.instant(), null, null, AuditOrigin.SYSTEM, action, entityType,
				entityId, serialize(details), null, null));
	}

	private @Nullable String serialize(@Nullable Map<String, ?> details) {
		return (details != null) ? this.json.writeValueAsString(details) : null;
	}

	private static @Nullable HttpServletRequest currentRequest() {
		return (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)
				? attributes.getRequest() : null;
	}

	private static AuditOrigin origin() {
		return AuditContext.current().map(AuditContext.Scope::origin)
			.orElseGet(() -> (currentRequest() != null) ? AuditOrigin.REST : AuditOrigin.SYSTEM);
	}

	private static @Nullable String correlation() {
		return AuditContext.current().map(AuditContext.Scope::correlationId).orElse(null);
	}

	private static @Nullable String ip() {
		HttpServletRequest request = currentRequest();
		return (request != null) ? request.getRemoteAddr() : null;
	}

}
