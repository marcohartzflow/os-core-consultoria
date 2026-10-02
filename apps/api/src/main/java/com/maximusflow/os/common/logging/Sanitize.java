package com.maximusflow.os.common.logging;

import org.jspecify.annotations.Nullable;

/** Neutralizes user-controlled text before it reaches a log line (ASVS 16.4.1, log injection). */
public final class Sanitize {

	private static final int MAX_LENGTH = 320;

	private Sanitize() {
	}

	public static String forLog(@Nullable String value) {
		if (value == null) {
			return "";
		}
		String cleaned = value.replaceAll("[\\p{Cntrl}\\p{Cf}]", "_");
		return (cleaned.length() > MAX_LENGTH) ? cleaned.substring(0, MAX_LENGTH) + "…" : cleaned;
	}


	/**
	 * An e-mail address for the security log, where personal data only goes masked: the first
	 * character and the domain stay (enough to tell a spray across one company from a typo), the rest
	 * of the local part does not. Text without {@code @} (a password typed into the e-mail field) is
	 * fully masked.
	 */
	public static String maskEmail(@Nullable String value) {
		String cleaned = forLog(value);
		int at = cleaned.lastIndexOf('@');
		if (at <= 0) {
			return cleaned.isEmpty() ? "" : "***";
		}
		return cleaned.charAt(0) + "***" + cleaned.substring(at);
	}

}
