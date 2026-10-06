package com.maximusflow.os.iam;

import java.util.UUID;

/**
 * Published when a password is set through a reset link. Listeners must terminate every session of
 * the user, since a reset usually means the previous credential is no longer trusted. Self-service
 * password changes do not publish this event: the auth module keeps the current session and
 * terminates the others itself. Carries the id only: events are archived, and an archived e-mail
 * would survive anonymization.
 */
public record PasswordChanged(UUID userId) {
}
