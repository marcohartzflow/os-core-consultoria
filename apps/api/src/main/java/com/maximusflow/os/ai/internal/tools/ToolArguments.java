package com.maximusflow.os.ai.internal.tools;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.jspecify.annotations.Nullable;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.cfg.JsonNodeFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * What the audit trail keeps of a tool call's arguments: the argument names and an HMAC-SHA256 of the
 * canonical arguments JSON under a server key ({@code os.ai.audit-key}), never the values (LGPD art. 6
 * III, OWASP ASVS 5.0 14.2.4). The values are free text chosen by the model and may carry personal data;
 * the trail is append-only and kept for years, while {@code ai_pending_action} (which holds the full
 * arguments) is purged after 90 days. A plain hash of short arguments (an id, a name) could be reversed
 * by hashing guesses; the keyed one cannot without the key (pseudonymisation, LGPD art. 13 § 4). While
 * the pending action exists, {@link #auditDetails(String)} of its arguments matches the trail row.
 *
 * <p>Canonical form: the JSON parsed and written back compact (no whitespace) with object properties
 * sorted by name at every level ({@link JsonNodeFeature#WRITE_PROPERTIES_SORTED}), UTF-8. Input that is
 * not JSON is used as received.
 */
public final class ToolArguments {

	private static final String HMAC = "HmacSHA256";

	private static final JsonMapper CANONICAL = JsonMapper.builder()
		.enable(JsonNodeFeature.WRITE_PROPERTIES_SORTED)
		.build();

	private final SecretKeySpec key;

	/** @param base64Key 32 random bytes in Base64 ({@code openssl rand -base64 32}); startup fails otherwise */
	public ToolArguments(@Nullable String base64Key) {
		byte[] raw;
		try {
			raw = base64Key == null || base64Key.isBlank() ? new byte[0] : Base64.getDecoder().decode(base64Key.strip());
		}
		catch (IllegalArgumentException ex) {
			raw = new byte[0];
		}
		if (raw.length != 32) {
			throw new IllegalStateException(
					"os.ai.audit-key (OS_AI_AUDIT_KEY) must be 32 random bytes in Base64: openssl rand -base64 32");
		}
		this.key = new SecretKeySpec(raw, HMAC);
	}

	/** Audit details for the arguments: {@code argumentNames} (top level, sorted) and {@code argumentsHmac}. */
	public Map<String, Object> auditDetails(String arguments) {
		return Map.of("argumentNames", names(arguments), "argumentsHmac", hmac(arguments));
	}

	/** Hex HMAC-SHA256 of the canonical form of {@code arguments}. */
	String hmac(String arguments) {
		try {
			// A Mac is not thread-safe: one per call (tool calls of a turn may run on other threads).
			Mac mac = Mac.getInstance(HMAC);
			mac.init(this.key);
			return HexFormat.of().formatHex(mac.doFinal(canonical(arguments).getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException | InvalidKeyException ex) {
			// Every Java platform must provide HmacSHA256 (javax.crypto.Mac), and the key is checked above.
			throw new IllegalStateException(ex);
		}
	}

	/**
	 * Hex SHA-256 of the canonical form of {@code arguments}, unkeyed: binds a single-use approval to the
	 * arguments the person saw. It lives only in {@code ai_tool_grant}, next to the conversation that
	 * already holds the values, and is deleted when used or expired; it never reaches the trail.
	 */
	public static String sha256(String arguments) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
				.digest(canonical(arguments).getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			// Every Java platform must provide SHA-256 (java.security.MessageDigest).
			throw new IllegalStateException(ex);
		}
	}

	static String canonical(String arguments) {
		try {
			return CANONICAL.writeValueAsString(CANONICAL.readTree(arguments));
		}
		catch (JacksonException ex) {
			return arguments;
		}
	}

	private static List<String> names(String arguments) {
		try {
			JsonNode tree = CANONICAL.readTree(arguments);
			return tree.isObject() ? tree.propertyNames().stream().sorted().toList() : List.of();
		}
		catch (JacksonException ex) {
			return List.of();
		}
	}

}
