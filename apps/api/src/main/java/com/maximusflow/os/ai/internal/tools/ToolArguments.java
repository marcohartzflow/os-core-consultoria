package com.maximusflow.os.ai.internal.tools;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.cfg.JsonNodeFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * What the audit trail keeps of a tool call's arguments: the argument names and a SHA-256 of the
 * canonical arguments JSON, never the values (LGPD art. 6 III, OWASP ASVS 5.0 14.2.4). The values are
 * free text chosen by the model and may carry personal data; the trail is append-only and kept for
 * years, while {@code ai_pending_action} (which holds the full arguments) is purged after 90 days. While
 * the pending action exists, its arguments hashed with {@link #sha256(String)} match the trail row.
 *
 * <p>Canonical form: the JSON parsed and written back compact (no whitespace) with object properties
 * sorted by name at every level ({@link JsonNodeFeature#WRITE_PROPERTIES_SORTED}), UTF-8. Input that is
 * not JSON is hashed as received.
 */
public final class ToolArguments {

	private static final JsonMapper CANONICAL = JsonMapper.builder()
		.enable(JsonNodeFeature.WRITE_PROPERTIES_SORTED)
		.build();

	private ToolArguments() {
	}

	/** Audit details for the arguments: {@code argumentNames} (top level, sorted) and {@code argumentsSha256}. */
	public static Map<String, Object> auditDetails(String arguments) {
		return Map.of("argumentNames", names(arguments), "argumentsSha256", sha256(arguments));
	}

	/** Hex SHA-256 of the canonical form of {@code arguments}. */
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
