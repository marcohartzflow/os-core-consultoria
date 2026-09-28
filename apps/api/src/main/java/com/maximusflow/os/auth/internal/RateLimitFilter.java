package com.maximusflow.os.auth.internal;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;

import com.maximusflow.os.common.error.RateLimitedException;
import com.maximusflow.os.common.logging.Sanitize;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Per-client-IP limits on the endpoints that can be abused without a session: login (password
 * spraying across accounts, Argon2 CPU exhaustion), password-reset requests (mail bombing) and
 * token submission. Account lockout covers per-account brute force; this covers the rest.
 */
class RateLimitFilter extends OncePerRequestFilter {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final Map<String, RateLimiter> limiters;

	private final HandlerExceptionResolver resolver;

	RateLimitFilter(AuthProperties.RateLimit properties, Clock clock, HandlerExceptionResolver resolver) {
		var login = new RateLimiter(properties.loginPerMinute(), Duration.ofMinutes(1), clock);
		var recovery = new RateLimiter(properties.recoveryPerMinute(), Duration.ofMinutes(1), clock);
		this.limiters = Map.of(
				"POST /api/auth/login", login,
				"POST /api/iam/password-reset/request", recovery,
				"POST /api/iam/password-reset/confirm", recovery,
				"POST /api/iam/invitations/accept", recovery);
		this.resolver = resolver;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		RateLimiter limiter = this.limiters.get(request.getMethod() + " " + request.getRequestURI());
		if (limiter != null && !limiter.tryAcquire(request.getRemoteAddr())) {
			security.warn("rate limit exceeded ip={} endpoint={}", Sanitize.forLog(request.getRemoteAddr()),
					request.getRequestURI());
			this.resolver.resolveException(request, response, null,
					new RateLimitedException("Muitas tentativas. Aguarde um minuto e tente de novo"));
			return;
		}
		chain.doFilter(request, response);
	}

}
