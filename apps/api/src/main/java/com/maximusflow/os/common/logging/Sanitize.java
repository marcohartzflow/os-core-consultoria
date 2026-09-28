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

}
