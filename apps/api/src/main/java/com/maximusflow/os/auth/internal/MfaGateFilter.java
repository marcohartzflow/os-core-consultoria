package com.maximusflow.os.auth.internal;

import java.io.IOException;
import java.net.URI;
import java.util.Set;

import com.maximusflow.os.common.security.MfaSession;
import com.maximusflow.os.common.security.OsPrincipal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import tools.jackson.databind.ObjectMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Second-factor gate, after authorization. Two states block a session: the account has a second
 * factor and this session has not passed it yet (only the verification endpoint, the profile and
 * logout are reachable); or policy requires a second factor and the person has not enrolled (only
 * the enrolment endpoints, the profile, the password change and logout are reachable).
 */
public class MfaGateFilter extends OncePerRequestFilter {

	static final URI VERIFICATION_REQUIRED = URI.create("urn:os:problem:mfa-required");

	static final URI ENROLMENT_REQUIRED = URI.create("urn:os:problem:mfa-enrolment-required");

	private static final Set<String> WHILE_UNVERIFIED = Set.of("POST /api/auth/mfa", "GET /api/me",
			"POST /api/auth/logout", "GET /api/auth/csrf");

	private static final Set<String> WHILE_UNENROLLED = Set.of("GET /api/me", "GET /api/me/mfa",
			"POST /api/me/mfa/setup", "POST /api/me/mfa/confirm", "POST /api/me/password", "POST /api/auth/logout",
			"GET /api/auth/csrf");

	private final ObjectMapper json;

	MfaGateFilter(ObjectMapper json) {
		this.json = json;
	}

	/** Whether the current session already passed the second factor. */
	public static boolean verified(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return session != null && Boolean.TRUE.equals(session.getAttribute(MfaSession.VERIFIED));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication != null && authentication.getPrincipal() instanceof OsPrincipal principal) {
			String call = request.getMethod() + " " + request.getRequestURI();
			if (principal.isMfaEnabled() && !verified(request) && !WHILE_UNVERIFIED.contains(call)) {
				refuse(response, VERIFICATION_REQUIRED, "Segundo fator pendente",
						"Informe o código do seu aplicativo autenticador para continuar");
				return;
			}
			if (!principal.isMfaEnabled() && principal.isMfaRequired() && !WHILE_UNENROLLED.contains(call)) {
				refuse(response, ENROLMENT_REQUIRED, "Segundo fator obrigatório",
						"Configure o segundo fator na sua conta antes de continuar");
				return;
			}
		}
		chain.doFilter(request, response);
	}

	private void refuse(HttpServletResponse response, URI type, String title, String detail) throws IOException {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, detail);
		problem.setType(type);
		problem.setTitle(title);
		response.setStatus(HttpStatus.FORBIDDEN.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(this.json.writeValueAsString(problem));
	}

}
