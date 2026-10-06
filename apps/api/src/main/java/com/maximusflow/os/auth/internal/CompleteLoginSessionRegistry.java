package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import com.maximusflow.os.common.security.SecondFactor;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;

/**
 * The sessions the concurrent-session limit counts: only live ones (within the absolute lifetime)
 * whose login is complete (second factor passed, when the account needs one). The limit runs when the second factor is passed, so
 * someone who knows only the password cannot end the person's verified sessions by logging in.
 */
final class CompleteLoginSessionRegistry implements SessionRegistry {

	private final SessionRegistry delegate;

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	private final Duration absoluteTimeout;

	private final Clock clock;

	CompleteLoginSessionRegistry(SessionRegistry delegate, FindByIndexNameSessionRepository<? extends Session> sessions,
			Duration absoluteTimeout, Clock clock) {
		this.delegate = delegate;
		this.sessions = sessions;
		this.absoluteTimeout = absoluteTimeout;
		this.clock = clock;
	}

	/** A mutable list: the concurrency strategy sorts it in place. */
	@Override
	public List<SessionInformation> getAllSessions(Object principal, boolean includeExpiredSessions) {
		return this.delegate.getAllSessions(principal, includeExpiredSessions).stream()
			.filter((info) -> complete(info.getSessionId()))
			.collect(Collectors.toCollection(ArrayList::new));
	}

	private boolean complete(String sessionId) {
		Session session = this.sessions.findById(sessionId);
		if (session == null || session.getCreationTime().plus(this.absoluteTimeout).isBefore(this.clock.instant())) {
			return false;
		}
		SecurityContext context = (session != null)
				? session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY) : null;
		Authentication authentication = (context != null) ? context.getAuthentication() : null;
		return authentication != null
				&& (!SecondFactor.required(authentication) || SecondFactor.present(authentication));
	}

	@Override
	public List<Object> getAllPrincipals() {
		return this.delegate.getAllPrincipals();
	}

	@Override
	public @Nullable SessionInformation getSessionInformation(String sessionId) {
		return this.delegate.getSessionInformation(sessionId);
	}

	@Override
	public void refreshLastRequest(String sessionId) {
		this.delegate.refreshLastRequest(sessionId);
	}

	@Override
	public void registerNewSession(String sessionId, Object principal) {
		this.delegate.registerNewSession(sessionId, principal);
	}

	@Override
	public void removeSessionInformation(String sessionId) {
		this.delegate.removeSessionInformation(sessionId);
	}

}
