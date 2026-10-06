package com.maximusflow.os.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Records in the current session that the person passed a second factor (implemented by the auth
 * module). Used by the login's second step and by enrolment, which proves the factor as well.
 */
public interface SecondFactorGrant {

	/** Adds {@code factorAuthority} (one of {@link SecondFactor#AUTHORITIES}) to the session's authentication. */
	void grant(String factorAuthority, HttpServletRequest request, HttpServletResponse response);

}
