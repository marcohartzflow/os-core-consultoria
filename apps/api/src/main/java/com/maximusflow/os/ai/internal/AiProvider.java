package com.maximusflow.os.ai.internal;

/**
 * Model providers the agent can call. Each one is a Spring AI chat starter, a subprocessor under
 * the LGPD (prompts and tool results leave the server) and an API key of its own.
 */
public enum AiProvider {

	ANTHROPIC("spring.ai.anthropic.api-key"),

	OPENAI("spring.ai.openai.api-key");

	private final String apiKeyProperty;

	AiProvider(String apiKeyProperty) {
		this.apiKeyProperty = apiKeyProperty;
	}

	/** The property holding the provider's key; a provider without one is not offered. */
	public String apiKeyProperty() {
		return this.apiKeyProperty;
	}

}
