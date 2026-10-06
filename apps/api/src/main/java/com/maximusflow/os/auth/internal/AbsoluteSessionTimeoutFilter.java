package com.maximusflow.os.auth.internal;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Enforces the absolute session lifetime (ASVS 7.3.2). A session older than the limit is
 * invalidated before Spring Security reads it, so the request proceeds unauthenticated.
 */
class AbsoluteSessionTimeoutFilter extends OncePerRequestFilter {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final Duration absoluteTimeout;

	private final Clock clock;

	AbsoluteSessionTimeoutFilter(Duration absoluteTimeout, Clock clock) {
		this.absoluteTimeout = absoluteTimeout;
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		HttpSession session = request.getSession(false);
		if (session != null) {
			Instant createdAt = Instant.ofEpochMilli(session.getCreationTime());
			if (createdAt.plus(this.absoluteTimeout).isBefore(this.clock.instant())) {
				security.info("session absolute timeout reached, invalidating session created at {}", createdAt);
				session.invalidate();
			}
		}
		chain.doFilter(request, response);
	}

}
