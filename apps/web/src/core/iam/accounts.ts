import type { UserSummary } from "@/core/api/types";

/**
 * Accounts that sign in today: active and not anonymized (a temporary lockout still counts).
 * Pending invitations are left out: they cannot enrol a second factor before accepting.
 */
export function isActiveAccount(user: UserSummary): boolean {
  return user.status === "ACTIVE" && !user.anonymizedAt;
}
