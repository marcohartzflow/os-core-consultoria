package com.maximusflow.os.iam;

import java.util.UUID;

/**
 * Published when an administrator disables a user. Listeners must terminate the user's sessions.
 * Carries the id only: events are archived, and an archived e-mail would survive anonymization.
 */
public record UserDisabled(UUID userId) {
}
