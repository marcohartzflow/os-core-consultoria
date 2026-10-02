package com.maximusflow.os.auth.internal.web;

import java.util.Locale;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.UserDirectory;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.MfaSession;
import com.maximusflow.os.common.security.SecondFactor;
import com.maximusflow.os.common.security.SecondFactorGrant;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * JSON login. Logout is handled by Spring Security's {@code LogoutFilter} at
 * {@code POST /api/auth/logout}.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	// Password fields: 512 UTF-16 units (4 × 128), so the password policy's 128 code points is the limit.
	record LoginRequest(@NotBlank @Size(max = 320) String email, @NotBlank @Size(max = 512) String password) {
	}

	record MfaRequest(@NotBlank @Size(max = 20) String code) {
	}

	static final int MAX_MFA_FAILURES = 5;

	private static final org.slf4j.Logger security = org.slf4j.LoggerFactory.getLogger("SECURITY");

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AuthenticationManager authenticationManager;

	private final SessionAuthenticationStrategy sessionStrategy;

	private final SecurityContextRepository securityContextRepository;

	private final UserDirectory userDirectory;

	private final SecondFactorGrant secondFactor;

	AuthController(AuthenticationManager authenticationManager, SessionAuthenticationStrategy sessionStrategy,
			SecurityContextRepository securityContextRepository, UserDirectory userDirectory, CurrentUser currentUser,
			AuditRecorder audit, SecondFactorGrant secondFactor) {
		this.secondFactor = secondFactor;
		this.currentUser = currentUser;
		this.audit = audit;
		this.authenticationManager = authenticationManager;
		this.sessionStrategy = sessionStrategy;
		this.securityContextRepository = securityContextRepository;
		this.userDirectory = userDirectory;
	}

	@PostMapping("/login")
	MeResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request,
			HttpServletResponse response) {
		String email = body.email().strip().toLowerCase(Locale.ROOT);
		Authentication authentication = this.authenticationManager
			.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, body.password()));

		// A login never inherits the previous session: its second-factor state, failure counter and any
		// other attribute belong to the person who was logged in before, who may be someone else.
		HttpSession previous = request.getSession(false);
		if (previous != null) {
			previous.invalidate();
		}
		SecurityContextHolder.clearContext();

		// Session fixation protection, concurrent session limit, registry (same as the filter-based flow).
		this.sessionStrategy.onAuthentication(authentication, request, response);

		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		this.securityContextRepository.saveContext(context, request, response);

		OsPrincipal principal = (OsPrincipal) authentication.getPrincipal();
		return this.userDirectory.findById(principal.getId()).map((a) -> MeResponse.of(a, false)).orElseThrow();
	}

	/**
	 * Second step of the login when the account has a second factor: a TOTP or recovery code. Five
	 * failures end the session. Replayed codes are refused by the IAM module.
	 */
	@PostMapping("/mfa")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void verifyMfa(@Valid @RequestBody MfaRequest body, HttpServletRequest request, HttpServletResponse response) {
		OsPrincipal principal = this.currentUser.require();
		HttpSession session = request.getSession(false);
		if (session == null) {
			throw new IllegalStateException("Authenticated request without session");
		}
		if (this.userDirectory.verifyMfa(principal.getId(), body.code())) {
			session.removeAttribute(MfaSession.FAILURES);
			// Also answers a step-up: the factor is stamped again with the current time. The session
			// gets a new id and CSRF token, so values captured before this step are worthless.
			this.secondFactor.grant(SecondFactor.TOTP_AUTHORITY, request, response);
			this.audit.recordFor(principal.getId(), principal.getEmail(), "auth.mfa.verified", "user",
					principal.getId().toString(), null);
			return;
		}
		Integer failures = (Integer) session.getAttribute(MfaSession.FAILURES);
		int count = (failures != null) ? failures + 1 : 1;
		session.setAttribute(MfaSession.FAILURES, count);
		security.warn("mfa failure user={} attempt={}", principal.getId(), count);
		if (count >= MAX_MFA_FAILURES) {
			this.audit.recordFor(principal.getId(), principal.getEmail(), "auth.mfa.locked", "user",
					principal.getId().toString(), null);
			session.invalidate();
			SecurityContextHolder.clearContext();
			throw new org.springframework.security.authentication.BadCredentialsException(
					"Muitas tentativas. Entre de novo");
		}
		throw new DomainRuleException("Código inválido");
	}

	/** Forces the deferred CSRF token to be generated so the {@code XSRF-TOKEN} cookie is written. */
	@GetMapping("/csrf")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void csrf(CsrfToken token) {
		token.getToken();
	}

}
