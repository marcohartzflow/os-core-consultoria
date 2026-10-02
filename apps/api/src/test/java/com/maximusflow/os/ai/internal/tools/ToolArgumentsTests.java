package com.maximusflow.os.ai.internal.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The trail keeps which arguments a tool got and a fingerprint of them, never their values. */
class ToolArgumentsTests {

	@Test
	void namesAndHashButNoValues() {
		Map<String, Object> details = ToolArguments
			.auditDetails("{\"title\":\"Ligar para Maria Souza\",\"assigneeId\":\"ana-xyz\"}");

		assertThat(details).containsOnlyKeys("argumentNames", "argumentsSha256");
		assertThat(details.get("argumentNames")).isEqualTo(List.of("assigneeId", "title"));
		assertThat(details.toString()).doesNotContain("Maria", "Souza", "ana-xyz");
		assertThat((String) details.get("argumentsSha256")).hasSize(64).matches("[0-9a-f]+");
	}

	/** The pending action stores what the model sent; the same call hashes alike whatever its layout. */
	@Test
	void theHashIsOverTheCanonicalJson() {
		String sent = "{ \"b\": {\"y\": 1, \"x\": [2, {\"d\":0,\"c\":1}]},\n \"a\": \"á\" }";
		assertThat(ToolArguments.canonical(sent)).isEqualTo("{\"a\":\"á\",\"b\":{\"x\":[2,{\"c\":1,\"d\":0}],\"y\":1}}");
		assertThat(ToolArguments.sha256(sent)).isEqualTo(ToolArguments.sha256("{\"a\":\"á\",\"b\":{\"y\":1,\"x\":[2,{\"c\":1,\"d\":0}]}}"))
			.isNotEqualTo(ToolArguments.sha256("{\"a\":\"b\"}"));
	}

	@Test
	void textThatIsNotJsonIsHashedAsReceived() {
		assertThat(ToolArguments.canonical("not json")).isEqualTo("not json");
		assertThat(ToolArguments.auditDetails("not json").get("argumentNames")).isEqualTo(List.of());
	}

}
