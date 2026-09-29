package com.maximusflow.os.iam;

import java.util.Optional;
import java.util.UUID;

/** Public API of the IAM module used by the auth module. */
public interface UserDirectory {

	Optional<AccountSnapshot> findByEmail(String email);

	Optional<AccountSnapshot> findById(UUID id);

	/** Increments the failed-login counter and locks the account when the limit is reached. */
	void recordLoginFailure(String email);

	/** Resets the failed-login counter and stores the last login time. */
	void recordLoginSuccess(UUID userId);

	/**
	 * Changes the password of the given user after checking the current one and the password
	 * policy. Does not touch sessions; the caller decides which sessions survive.
	 */
	void changePassword(UUID userId, String currentPassword, String newPassword);

	/**
	 * Replaces a stored hash that uses an outdated algorithm or parameters with one produced by the
	 * current encoder, after a successful login. Nothing else about the account changes.
	 */
	void upgradePasswordHash(UUID userId, String encodedHash);

	MfaStatus mfaStatus(UUID userId);

	/** Checks a TOTP or recovery code for the login flow. False for accounts without a second factor. */
	boolean verifyMfa(UUID userId, String code);

}
