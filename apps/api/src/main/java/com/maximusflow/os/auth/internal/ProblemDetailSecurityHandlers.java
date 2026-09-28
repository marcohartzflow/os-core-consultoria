package com.maximusflow.os.auth.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Routes security exceptions raised in the filter chain to the MVC exception handler so 401 and 403
 * share the RFC 9457 format used by controllers.
 */
class ProblemDetailSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

	private final HandlerExceptionResolver resolver;

	ProblemDetailSecurityHandlers(HandlerExceptionResolver resolver) {
		this.resolver = resolver;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) {
		this.resolver.resolveException(request, response, null, ex);
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) {
		this.resolver.resolveException(request, response, null, ex);
	}

}
