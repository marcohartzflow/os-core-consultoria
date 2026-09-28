package com.maximusflow.os.common.security;

/** Session attributes that record the second factor state of the current login. */
public final class MfaSession {

	/** {@code Boolean.TRUE} once the person passed the second factor in this session. */
	public static final String VERIFIED = "os.mfa.verified";

	/** Consecutive failed second-factor attempts in this session. */
	public static final String FAILURES = "os.mfa.failures";

	private MfaSession() {
	}

}
