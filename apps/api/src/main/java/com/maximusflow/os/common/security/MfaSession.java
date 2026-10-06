package com.maximusflow.os.common.security;

/**
 * Session attributes of the login's second step. Whether the factor was passed is not one of them:
 * that is a {@link SecondFactor} authority on the session's authentication.
 */
public final class MfaSession {

	/** Consecutive failed second-factor attempts in this session. */
	public static final String FAILURES = "os.mfa.failures";

	private MfaSession() {
	}

}
