package com.maximusflow.os.auth.internal;

import java.io.IOException;
import java.net.URI;

import com.maximusflow.os.common.logging.Sanitize;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.SecondFactor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.authorization.FactorAuthorizationDecision;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Routes security exceptions raised in the filter chain to the MVC exception handler so 401 and 403
 * share the RFC 9457 format used by controllers. A refusal for a missing second factor (Spring
 * Security's {@link FactorAuthorizationDecision}) gets its own problem type, which tells the portal
 * what to ask for: the code, enrolment, or the code again for a step-up.
 */
class ProblemDetailSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

	static final URI VERIFICATION_REQUIRED = URI.create("urn:os:problem:mfa-required");

	static final URI ENROLMENT_REQUIRED = URI.create("urn:os:problem:mfa-enrolment-required");

	static final URI REVERIFICATION_REQUIRED = URI.create("urn:os:problem:mfa-reverification-required");

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final HandlerExceptionResolver resolver;

	private final ObjectMapper json;

	ProblemDetailSecurityHandlers(HandlerExceptionResolver resolver, ObjectMapper json) {
		this.resolver = resolver;
		this.json = json;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) {
		this.resolver.resolveException(request, response, null, ex);
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
			throws IOException {
		if (ex instanceof AuthorizationDeniedException denied
				&& denied.getAuthorizationResult() instanceof FactorAuthorizationDecision factors
				&& !factors.getFactorErrors().isEmpty()) {
			refuseForSecondFactor(request, response, factors);
			return;
		}
		this.resolver.resolveException(request, response, null, ex);
	}

	private void refuseForSecondFactor(HttpServletRequest request, HttpServletResponse response,
			FactorAuthorizationDecision factors) throws IOException {
		// The options are alternatives (TOTP or passkey), so the refusal lists the factor the person
		// never used as missing too. What matters is whether this session passed one at all: if it
		// did, it is only too old for this action (step-up).
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		boolean passedBefore = SecondFactor.present(authentication);
		boolean enrolled = authentication != null && authentication.getPrincipal() instanceof OsPrincipal principal
				&& principal.isMfaEnabled();
		ProblemDetail problem;
		if (passedBefore) {
			problem = problem(REVERIFICATION_REQUIRED, "Confirme o segundo fator",
					"Confirme com o seu segundo fator outra vez para fazer esta ação");
		}
		else if (enrolled) {
			problem = problem(VERIFICATION_REQUIRED, "Segundo fator pendente",
					"Confirme com o seu segundo fator para continuar");
		}
		else {
			problem = problem(ENROLMENT_REQUIRED, "Segundo fator obrigatório",
					"Configure o segundo fator na sua conta antes de continuar");
		}
		// ASVS 16.3.2: a refused request is a security event like any other access denial.
		security.warn("access denied reason={} method={} uri={} user={}", problem.getType(), request.getMethod(),
				Sanitize.forLog(request.getRequestURI()),
				(authentication != null) ? Sanitize.maskEmail(authentication.getName()) : "anonymous");
		response.setStatus(HttpStatus.FORBIDDEN.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(this.json.writeValueAsString(problem));
	}

	private static ProblemDetail problem(URI type, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, detail);
		problem.setType(type);
		problem.setTitle(title);
		return problem;
	}

}
