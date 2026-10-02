package com.maximusflow.os.common.audit;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.logging.RequestLoggingContextFilter;
import com.maximusflow.os.common.security.CurrentUser;

import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.ObjectMapper;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
		assertWritable();
		var actor = this.currentUser.get().orElse(null);
		this.repository.save(new AuditEvent(this.clock.instant(), (actor != null) ? actor.getId() : null,
				(actor != null) ? actor.getEmail() : null, origin(), action, entityType, entityId, serialize(details),
				ip(), correlation()));
	}

	/**
	 * Records an action of a known user before the security context exists for them, e.g. a
	 * successful login (the event fires before the context is stored).
	 */
	@Transactional
	public void recordFor(UUID actorId, String actorEmail, String action, @Nullable String entityType,
			@Nullable String entityId, @Nullable Map<String, ?> details) {
		assertWritable();
		this.repository.save(new AuditEvent(this.clock.instant(), actorId, actorEmail, origin(), action, entityType,
				entityId, serialize(details), ip(), correlation()));
	}

	/** Records an action for which there is no authenticated user, e.g. a failed login. */
	@Transactional
	public void recordAnonymous(String action, @Nullable String subjectEmail, @Nullable String entityType,
			@Nullable String entityId, @Nullable Map<String, ?> details) {
		assertWritable();
		this.repository.save(new AuditEvent(this.clock.instant(), null, subjectEmail, origin(), action, entityType,
				entityId, serialize(details), ip(), correlation()));
	}

	/** Records an action performed by the system itself (bootstrap, jobs). */
	@Transactional
	public void recordSystem(String action, @Nullable String entityType, @Nullable String entityId,
			@Nullable Map<String, ?> details) {
		assertWritable();
		this.repository.save(new AuditEvent(this.clock.instant(), null, null, AuditOrigin.SYSTEM, action, entityType,
				entityId, serialize(details), null, null));
	}

	/**
	 * A read-only caller transaction would swallow the row: Hibernate never flushes it, and nothing
	 * fails. Fail loudly instead, so the caller is fixed rather than the trail silently missing an entry.
	 */
	private static void assertWritable() {
		if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
			throw new IllegalStateException("Audit entries cannot be written inside a read-only transaction");
		}
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

	/**
	 * The conversation id inside an AI tool scope; otherwise the id of the HTTP request
	 * ({@link RequestLoggingContextFilter}), which is also in every log line of that request and in its
	 * {@code X-Request-Id} response header.
	 */
	private static @Nullable String correlation() {
		var scope = AuditContext.current();
		if (scope.isPresent()) {
			return scope.get().correlationId();
		}
		HttpServletRequest request = currentRequest();
		return (request != null) ? RequestLoggingContextFilter.requestId(request) : null;
	}

	/** The address captured by an open scope (work moved off the request thread), else the request's. */
	private static @Nullable String ip() {
		String captured = AuditContext.current().map(AuditContext.Scope::ip).orElse(null);
		if (captured != null) {
			return captured;
		}
		HttpServletRequest request = currentRequest();
		return (request != null) ? request.getRemoteAddr() : null;
	}

}
