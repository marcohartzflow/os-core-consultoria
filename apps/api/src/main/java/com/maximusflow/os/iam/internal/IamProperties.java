package com.maximusflow.os.iam.internal;

import java.time.Duration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import com.maximusflow.os.iam.internal.domain.LockoutPolicy;

import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties("os.iam")
@Validated
public record IamProperties(@DefaultValue @Valid Lockout lockout, @DefaultValue @Valid Password password,
		@DefaultValue Tokens tokens, @DefaultValue Bootstrap bootstrap, @DefaultValue Mfa mfa,
		@DefaultValue @Valid Administrators administrators) {

	/** Shortest password NIST SP 800-63B-4 accepts when it is the only factor. */
	static final int SINGLE_FACTOR_MIN_LENGTH = 15;

	public IamProperties {
		// Without a second factor for everyone, some passwords are the only factor, and NIST SP
		// 800-63B-4 then requires at least 15 characters (8 when part of multi-factor authentication).
		if (!mfa.requireForAll() && password.minLength() < SINGLE_FACTOR_MIN_LENGTH) {
			throw new IllegalArgumentException("os.iam.mfa.require-for-all=false requires os.iam.password.min-length >= "
					+ SINGLE_FACTOR_MIN_LENGTH);
		}
	}

	/**
	 * How many active system administrators the portal keeps at least. Removing or disabling one
	 * below this number is refused, so losing a single account never locks everyone out of access
	 * management. Never less than 1.
	 */
	public record Administrators(@DefaultValue("2") @Min(1) int minimum) {
	}

	/**
	 * Brute-force protection in the model of Keycloak's brute-force detection: every
	 * {@code maxAttempts} consecutive failures lock the account, each time for {@code waitIncrement}
	 * more (up to {@code maxWait}); the count starts over after a success or {@code failureReset}
	 * without failures. {@code permanentAfter} consecutive failures lock it until the password is
	 * reset; NIST SP 800-63B-4 allows no more than 100.
	 */
	public record Lockout(@DefaultValue("5") @Min(1) @Max(20) int maxAttempts,
			@DefaultValue("15m") Duration waitIncrement, @DefaultValue("6h") Duration maxWait,
			@DefaultValue("12h") Duration failureReset, @DefaultValue("100") @Min(1) @Max(100) int permanentAfter) {

		public Lockout {
			// A lock that outlasts the reset window would let the count start over after every lock,
			// and the permanent lock would never be reached.
			if (maxWait.compareTo(failureReset) >= 0) {
				throw new IllegalArgumentException("os.iam.lockout.max-wait must be shorter than failure-reset");
			}
		}

		public LockoutPolicy policy() {
			return new LockoutPolicy(this.maxAttempts, this.waitIncrement, this.maxWait, this.failureReset,
					this.permanentAfter);
		}

	}

	/** Password policy. {@code checkCompromised} queries Have I Been Pwned (k-anonymity) on set/change. */
	public record Password(@DefaultValue("12") @Min(8) int minLength, @DefaultValue("128") @Min(64) @Max(128) int maxLength,
			@DefaultValue("true") boolean checkCompromised) {
	}

	public record Tokens(@DefaultValue("48h") Duration invitationTtl, @DefaultValue("1h") Duration passwordResetTtl) {
	}

	/**
	 * Second factor. {@code encryptionKey} protects TOTP secrets at rest (32 random bytes, Base64).
	 * {@code issuer} is the name shown in authenticator apps.
	 */
	public record Mfa(@DefaultValue("true") boolean requireForSystemRole, @DefaultValue("true") boolean requireForAll,
			@Nullable String encryptionKey, @DefaultValue("OS") String issuer) {
	}

	/** First administrator, created only when the users table is empty. */
	public record Bootstrap(@Nullable String adminEmail, @Nullable String adminPassword,
			@DefaultValue("Administrador") String adminName,
			@DefaultValue("true") boolean requirePasswordChange) {
	}

}
