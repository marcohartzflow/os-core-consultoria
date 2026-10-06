package com.maximusflow.os.iam;

/**
 * Second-factor state of an account. {@code required} comes from policy (system role or global
 * setting); {@code enabled} means the person has at least one second factor: the authenticator app
 * ({@code totp}) or passkeys ({@code passkeys}, how many).
 */
public record MfaStatus(boolean enabled, boolean required, int recoveryCodesLeft, boolean totp, int passkeys) {

}
