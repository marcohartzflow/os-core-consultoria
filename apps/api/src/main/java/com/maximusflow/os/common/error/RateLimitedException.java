package com.maximusflow.os.common.error;

/** Too many requests from one client for a sensitive endpoint. Mapped to HTTP 429. */
public class RateLimitedException extends RuntimeException {

	public RateLimitedException(String message) {
		super(message);
	}

}
