package com.maximusflow.os.iam;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Public API of the IAM module used by the auth module. */
public interface UserDirectory {

	Optional<AccountSnapshot> findByEmail(String email);

	Optional<AccountSnapshot> findById(UUID id);

	/** Names of the given accounts in one query (for listings); ids without an account are left out. */
	Map<UUID, String> namesByIds(Collection<UUID> ids);

	/**
	 * Increments the failed-login counter and locks the account when the limit is reached. Returns
	 * the account's id, or empty when the typed e-mail is no account.
	 */
	Optional<UUID> recordLoginFailure(String email);

	/** Resets the failed-login counter and stores the last login time. */
	void recordLoginSuccess(UUID userId);

	/**
	 * Changes the password of the given user after checking the current one and the password
	 * policy. Does not touch sessions; the caller decides which sessions survive.
	 */
	void changePassword(UUID userId, String currentPassword, String newPassword);

	/**
	 * Sets or clears ({@code null} or blank) the optional second address for security notices, after
	 * checking the current password. Refuses the login e-mail itself. Every address involved, the
	 * replaced one included, is notified after commit.
	 */
	void changeNotificationEmail(UUID userId, String currentPassword, @Nullable String email);

	/**
	 * Replaces a stored hash that uses an outdated algorithm or parameters with one produced by the
	 * current encoder, after a successful login. Nothing else about the account changes.
	 */
	void upgradePasswordHash(UUID userId, String encodedHash);

	/**
	 * Refuses (AccessDeniedException) when the current user does not hold every permission of the
	 * account: whoever could not grant its access may not act on it either.
	 */
	void assertCanManage(UUID userId);

	MfaStatus mfaStatus(UUID userId);

	/** Checks a TOTP or recovery code for the login flow. False for accounts without a second factor. */
	boolean verifyMfa(UUID userId, String code);

}
