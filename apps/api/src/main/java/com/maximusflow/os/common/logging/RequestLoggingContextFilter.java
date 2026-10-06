package com.maximusflow.os.common.logging;

import java.io.IOException;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gives every request an id and puts it, with the client IP, in the SLF4J MDC for as long as the
 * request is handled (OWASP ASVS 5.0 16.2.1: each log entry says when, where and who). Spring Boot's
 * structured logging (prod profile) writes MDC entries into every JSON line, so a security warning,
 * an error and its stack trace all carry {@code http.request.id} and {@code client.ip}. The id is also
 * returned as {@value #HEADER}, so a person reporting a problem can quote it, and stored as the audit
 * entry's correlation id ({@code AuditRecorder}), so a trail row leads to its log lines.
 *
 * <p>The id is always generated here, never taken from the request: a client-chosen id could forge or
 * collide with another request's log lines. The IP is {@code getRemoteAddr()}, already the client's
 * address behind the trusted proxy (Tomcat's RemoteIpValve, {@code server.forward-headers-strategy}).
 * Runs before Spring Security's filter chain (order -100), so authentication failures are tagged too.
 *
 * <p>Registered through a {@code FilterRegistrationBean} ({@link LoggingConfig}), not as a bean of its
 * own: Spring Modulith's observability proxies public beans of a module, and a CGLIB proxy of a
 * {@code GenericFilterBean} has no logger.
 */
public class RequestLoggingContextFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Request-Id";

	public static final String MDC_REQUEST_ID = "http.request.id";

	public static final String MDC_CLIENT_IP = "client.ip";

	/** Request attribute holding the id, read by the audit recorder. */
	public static final String ATTRIBUTE = RequestLoggingContextFilter.class.getName() + ".id";

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String id = UUID.randomUUID().toString();
		request.setAttribute(ATTRIBUTE, id);
		response.setHeader(HEADER, id);
		MDC.put(MDC_REQUEST_ID, id);
		MDC.put(MDC_CLIENT_IP, Sanitize.forLog(request.getRemoteAddr()));
		try {
			chain.doFilter(request, response);
		}
		finally {
			MDC.remove(MDC_REQUEST_ID);
			MDC.remove(MDC_CLIENT_IP);
		}
	}

	/** The id of the request being handled, or null outside a request. */
	public static @Nullable String requestId(HttpServletRequest request) {
		return (request.getAttribute(ATTRIBUTE) instanceof String id) ? id : null;
	}

}
