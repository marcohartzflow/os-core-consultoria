package com.maximusflow.os.ai.internal;

import java.util.Map;

import org.springframework.ai.chat.model.ChatModel;

/**
 * The chat model of each provider on the classpath. A bean of its own so a test can put a scripted
 * model in place of every provider.
 */
public record ProviderChatModels(Map<AiProvider, ChatModel> models) {

	public ProviderChatModels {
		models = Map.copyOf(models);
	}

}
