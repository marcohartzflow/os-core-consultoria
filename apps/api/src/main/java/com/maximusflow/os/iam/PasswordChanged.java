package com.maximusflow.os.iam;

import java.util.UUID;

/**
 * Published when a password is set through a reset link. Listeners must terminate every session of
 * the user, since a reset usually means the previous credential is no longer trusted. Self-service
 * password changes do not publish this event: the auth module keeps the current session and
 * terminates the others itself.
 */
public record PasswordChanged(UUID userId, String email) {

}
