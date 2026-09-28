package com.maximusflow.os.auth.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("os.auth")
public record AuthProperties(@DefaultValue Session session, @DefaultValue RateLimit rateLimit) {

	/**
	 * Session limits and cookie. Inactivity timeout is {@code spring.session.timeout};
	 * {@code absoluteTimeout} is the maximum lifetime regardless of activity (ASVS 7.3.2);
	 * {@code maxConcurrent} sessions per user, the oldest is terminated when exceeded (ASVS 7.1.2);
	 * {@code cookieSecure} must only be false on plain-HTTP development setups.
	 */
	public record Session(@DefaultValue("12h") Duration absoluteTimeout, @DefaultValue("3") int maxConcurrent,
			@DefaultValue("true") boolean cookieSecure) {
	}

	/** Per-IP limits for unauthenticated endpoints. See {@link RateLimitFilter}. */
	public record RateLimit(@DefaultValue("20") int loginPerMinute, @DefaultValue("5") int recoveryPerMinute) {
	}

}
