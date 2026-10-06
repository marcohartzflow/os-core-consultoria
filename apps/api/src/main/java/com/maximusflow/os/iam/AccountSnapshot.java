package com.maximusflow.os.iam;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/**
 * Read model of a user account exposed to other modules (auth). Contains the password hash on
 * purpose: the auth module needs it to authenticate and erases it right after.
 */
public record AccountSnapshot(UUID id, String email, @Nullable String notificationEmail, String name, @Nullable String passwordHash,
		AccountStatus status, @Nullable Instant lockedUntil, boolean lockedPermanently, boolean passwordChangeRequired, boolean mfaEnabled,
		boolean mfaRequired, Set<String> roleNames, Set<String> permissions) {

	public boolean isLocked(Instant now) {
		return this.lockedPermanently || (this.lockedUntil != null && this.lockedUntil.isAfter(now));
	}

}
