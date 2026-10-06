package com.maximusflow.os.iam.internal.domain;

import java.time.Duration;

/** Parameters of {@link User#recordLoginFailure}; see {@code os.iam.lockout} for their meaning. */
public record LockoutPolicy(int maxAttempts, Duration waitIncrement, Duration maxWait, Duration failureReset,
		int permanentAfter) {
}
