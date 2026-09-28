package com.maximusflow.os.iam;

/**
 * Second-factor state of an account. {@code required} comes from policy (system role or global
 * setting); {@code enabled} means the person finished enrolment.
 */
public record MfaStatus(boolean enabled, boolean required, int recoveryCodesLeft) {

}
