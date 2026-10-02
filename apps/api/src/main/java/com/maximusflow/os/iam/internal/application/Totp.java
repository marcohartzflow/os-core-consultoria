package com.maximusflow.os.iam.internal.application;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Instant;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.bouncycastle.util.encoders.Base32;

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226): HMAC-SHA1, 6 digits, 30-second steps,
 * which is what every authenticator app expects. Secrets are 20 random bytes (160 bits).
 */
public final class Totp {

	public static final int DIGITS = 6;

	public static final long STEP_SECONDS = 30;

	/**
	 * Steps of tolerance on each side. None: OWASP ASVS 5.0 6.5.5 gives a TOTP a lifetime of at most
	 * 30 seconds, which only the current step meets (RFC 6238 allows a step of drift; the ASVS level
	 * this portal targets does not).
	 */
	static final int WINDOW = 0;

	private static final SecureRandom RANDOM = new SecureRandom();

	private Totp() {
	}

	public static byte[] generateSecret() {
		byte[] secret = new byte[20];
		RANDOM.nextBytes(secret);
		return secret;
	}

	public static String base32(byte[] secret) {
		return Base32.toBase32String(secret);
	}

	public static String otpauthUri(String issuer, String account, byte[] secret) {
		String label = encode(issuer) + ":" + encode(account);
		return "otpauth://totp/" + label + "?secret=" + base32(secret) + "&issuer=" + encode(issuer)
				+ "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
	}

	public static long stepAt(Instant now) {
		return Math.floorDiv(now.getEpochSecond(), STEP_SECONDS);
	}

	/** The code for one time step; used by tests and by the verification loop. */
	public static String code(byte[] secret, long step) {
		try {
			Mac mac = Mac.getInstance("HmacSHA1");
			mac.init(new SecretKeySpec(secret, "HmacSHA1"));
			byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
			int offset = hash[hash.length - 1] & 0x0f;
			int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
					| ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
			int otp = binary % 1_000_000;
			return String.format("%06d", otp);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("HmacSHA1 unavailable", ex);
		}
	}

	/**
	 * Returns the time step the code matches, or -1. Steps at or before {@code lastUsedStep} are
	 * rejected so a code observed once cannot be replayed within the window.
	 */
	public static long matchingStep(byte[] secret, String code, Instant now, long lastUsedStep) {
		if (code == null || code.length() != DIGITS || !code.chars().allMatch(Character::isDigit)) {
			return -1;
		}
		long current = stepAt(now);
		for (long step = current - WINDOW; step <= current + WINDOW; step++) {
			if (step > lastUsedStep && constantTimeEquals(code(secret, step), code)) {
				return step;
			}
		}
		return -1;
	}

	static boolean constantTimeEquals(String a, String b) {
		return java.security.MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII),
				b.getBytes(StandardCharsets.US_ASCII));
	}

	private static String encode(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
	}

}
