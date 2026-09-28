package com.maximusflow.os.iam.internal;

import java.time.Duration;

import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("os.iam")
public record IamProperties(@DefaultValue Lockout lockout, @DefaultValue Password password, @DefaultValue Tokens tokens,
		@DefaultValue Bootstrap bootstrap) {

	/** Brute-force protection: lock the account for {@code duration} after {@code maxAttempts} failures. */
	public record Lockout(@DefaultValue("5") int maxAttempts, @DefaultValue("15m") Duration duration) {
	}

	/** Password policy. {@code checkCompromised} queries Have I Been Pwned (k-anonymity) on set/change. */
	public record Password(@DefaultValue("12") int minLength, @DefaultValue("128") int maxLength,
			@DefaultValue("true") boolean checkCompromised) {
	}

	public record Tokens(@DefaultValue("48h") Duration invitationTtl, @DefaultValue("1h") Duration passwordResetTtl) {
	}

	/** First administrator, created only when the users table is empty. */
	public record Bootstrap(@Nullable String adminEmail, @Nullable String adminPassword,
			@DefaultValue("Administrador") String adminName,
			@DefaultValue("true") boolean requirePasswordChange) {
	}

}
