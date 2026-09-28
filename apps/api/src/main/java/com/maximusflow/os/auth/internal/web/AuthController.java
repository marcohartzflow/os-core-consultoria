package com.maximusflow.os.auth.internal.web;

import java.util.Locale;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.UserDirectory;

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

	record LoginRequest(@NotBlank @Size(max = 320) String email, @NotBlank @Size(max = 128) String password) {
	}

	private final AuthenticationManager authenticationManager;

	private final SessionAuthenticationStrategy sessionStrategy;

	private final SecurityContextRepository securityContextRepository;

	private final UserDirectory userDirectory;

	AuthController(AuthenticationManager authenticationManager, SessionAuthenticationStrategy sessionStrategy,
			SecurityContextRepository securityContextRepository, UserDirectory userDirectory) {
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

		// Session fixation protection, concurrent session limit, registry (same as the filter-based flow).
		this.sessionStrategy.onAuthentication(authentication, request, response);

		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		this.securityContextRepository.saveContext(context, request, response);

		OsPrincipal principal = (OsPrincipal) authentication.getPrincipal();
		return this.userDirectory.findById(principal.getId()).map(MeResponse::of).orElseThrow();
	}

	/** Forces the deferred CSRF token to be generated so the {@code XSRF-TOKEN} cookie is written. */
	@GetMapping("/csrf")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void csrf(CsrfToken token) {
		token.getToken();
	}

}
