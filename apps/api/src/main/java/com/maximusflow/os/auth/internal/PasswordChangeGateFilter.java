package com.maximusflow.os.auth.internal;

import java.io.IOException;
import java.net.URI;
import java.util.Set;

import com.maximusflow.os.common.security.OsPrincipal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * While a person still uses a password chosen by someone else (bootstrap administrator), the only
 * things they can do are read their own profile, change the password and log out. Runs after
 * authorization, so it only ever sees requests the person is otherwise allowed to make.
 */
class PasswordChangeGateFilter extends OncePerRequestFilter {

	static final URI PROBLEM_TYPE = URI.create("urn:os:problem:password-change-required");

	private static final Set<String> ALLOWED = Set.of("GET /api/me", "POST /api/me/password",
			"POST /api/auth/logout", "GET /api/auth/csrf");

	private final ObjectMapper json;

	PasswordChangeGateFilter(ObjectMapper json) {
		this.json = json;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication != null && authentication.getPrincipal() instanceof OsPrincipal principal
				&& principal.isPasswordChangeRequired()
				&& !ALLOWED.contains(request.getMethod() + " " + request.getRequestURI())) {
			ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
					"Defina uma nova senha antes de continuar");
			problem.setType(PROBLEM_TYPE);
			problem.setTitle("Troca de senha obrigatória");
			response.setStatus(HttpStatus.FORBIDDEN.value());
			response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
			response.getWriter().write(this.json.writeValueAsString(problem));
			return;
		}
		chain.doFilter(request, response);
	}

}
