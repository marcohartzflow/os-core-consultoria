package com.maximusflow.os.iam;

import java.util.UUID;

/** Published when an administrator disables a user. Listeners must terminate the user's sessions. */
public record UserDisabled(UUID userId, String email) {

}
