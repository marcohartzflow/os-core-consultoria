package com.maximusflow.os.common.security;

import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.FactorGrantedAuthority;

/**
 * The second factors a session can hold, as Spring Security's {@link FactorGrantedAuthority}
 * (multi-factor authentication, Spring Security 7). A passkey uses the built-in
 * {@link FactorGrantedAuthority#WEBAUTHN_AUTHORITY}. TOTP has no built-in factor, so it gets its own
 * authority, which the multi-factor rules accept like any other ({@code RequiredFactor.authority}).
 */
public final class SecondFactor {

	/** Granted when the person types a valid code from their authenticator app (RFC 6238) or a recovery code. */
	public static final String TOTP_AUTHORITY = "FACTOR_TOTP";

	/** Any of these completes the login after the password. */
	public static final Set<String> AUTHORITIES = Set.of(TOTP_AUTHORITY, FactorGrantedAuthority.WEBAUTHN_AUTHORITY);

	private SecondFactor() {
	}

	/**
	 * Whether this login must pass a second factor: the account enrolled one, or policy requires one
	 * (then the person can only enrol until they do).
	 */
	public static boolean required(@Nullable Authentication authentication) {
		return authentication != null && authentication.getPrincipal() instanceof OsPrincipal principal
				&& (principal.isMfaEnabled() || principal.isMfaRequired());
	}

	/** Whether the session already passed a second factor. */
	public static boolean present(@Nullable Authentication authentication) {
		return authentication != null && authentication.getAuthorities().stream()
			.map(GrantedAuthority::getAuthority)
			.anyMatch(AUTHORITIES::contains);
	}

}
