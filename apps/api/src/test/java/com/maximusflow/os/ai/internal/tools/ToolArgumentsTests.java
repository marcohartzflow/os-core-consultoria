package com.maximusflow.os.ai.internal.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

/** The trail keeps which arguments a tool got and a keyed fingerprint of them, never their values. */
class ToolArgumentsTests {

	/** 32 bytes in Base64, for tests only. */
	static final String KEY = "dGVzdC1hdWRpdC10ZXN0LWF1ZGl0LXRlc3QtYXVkaXQ=";

	private final ToolArguments arguments = new ToolArguments(KEY);

	@Test
	void namesAndHmacButNoValues() {
		Map<String, Object> details = this.arguments
			.auditDetails("{\"title\":\"Ligar para Maria Souza\",\"assigneeId\":\"ana-xyz\"}");

		assertThat(details).containsOnlyKeys("argumentNames", "argumentsHmac");
		assertThat(details.get("argumentNames")).isEqualTo(List.of("assigneeId", "title"));
		assertThat(details.toString()).doesNotContain("Maria", "Souza", "ana-xyz");
		assertThat((String) details.get("argumentsHmac")).hasSize(64).matches("[0-9a-f]+");
	}

	/** Without the key, hashing a guess does not find the row: the fingerprint is not a plain hash. */
	@Test
	void theFingerprintDependsOnTheKey() {
		String call = "{\"id\":\"42\"}";
		assertThat(this.arguments.hmac(call)).isNotEqualTo(ToolArguments.sha256(call))
			.isNotEqualTo(new ToolArguments("b3RoZXIta2V5LW90aGVyLWtleS1vdGhlci1rZXktMDE=").hmac(call))
			.isEqualTo(new ToolArguments(KEY).hmac(call));
	}

	/** The pending action stores what the model sent; the same call hashes alike whatever its layout. */
	@Test
	void theHashIsOverTheCanonicalJson() {
		String sent = "{ \"b\": {\"y\": 1, \"x\": [2, {\"d\":0,\"c\":1}]},\n \"a\": \"á\" }";
		String compact = "{\"a\":\"á\",\"b\":{\"y\":1,\"x\":[2,{\"c\":1,\"d\":0}]}}";
		assertThat(ToolArguments.canonical(sent)).isEqualTo("{\"a\":\"á\",\"b\":{\"x\":[2,{\"c\":1,\"d\":0}],\"y\":1}}");
		assertThat(ToolArguments.sha256(sent)).isEqualTo(ToolArguments.sha256(compact))
			.isNotEqualTo(ToolArguments.sha256("{\"a\":\"b\"}"));
		assertThat(this.arguments.hmac(sent)).isEqualTo(this.arguments.hmac(compact));
	}

	@Test
	void textThatIsNotJsonIsHashedAsReceived() {
		assertThat(ToolArguments.canonical("not json")).isEqualTo("not json");
		assertThat(this.arguments.auditDetails("not json").get("argumentNames")).isEqualTo(List.of());
	}

	@Test
	void startupNeedsA32ByteKey() {
		assertThatIllegalStateException().isThrownBy(() -> new ToolArguments(null));
		assertThatIllegalStateException().isThrownBy(() -> new ToolArguments("c2hvcnQ="));
		assertThatIllegalStateException().isThrownBy(() -> new ToolArguments("not base64!"));
	}

}
