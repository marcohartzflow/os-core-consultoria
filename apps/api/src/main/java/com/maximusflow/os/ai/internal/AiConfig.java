package com.maximusflow.os.ai.internal;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import com.maximusflow.os.ai.internal.tools.SafeToolExceptionProcessor;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.ChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.tool.execution.ToolExecutionExceptionProcessor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;

@Configuration(proxyBeanMethods = false)
class AiConfig {

	/** Conversation window persisted in Postgres (table SPRING_AI_CHAT_MEMORY, created by Flyway). */
	@Bean
	ChatMemory chatMemory(ChatMemoryRepository repository, AiProperties properties) {
		return MessageWindowChatMemory.builder().chatMemoryRepository(repository)
			.maxMessages(properties.maxMessages()).build();
	}

	/**
	 * What the model reads when a tool fails: domain refusals and "sem permissão" as written, a generic
	 * text for anything else, never SQL or library messages (OWASP LLM02). Replaces Spring AI's default,
	 * which returns the exception message; {@code ToolCallingAutoConfiguration} backs off for this bean.
	 */
	@Bean
	ToolExecutionExceptionProcessor toolExecutionExceptionProcessor() {
		return new SafeToolExceptionProcessor();
	}

	/**
	 * The portal's agent. Tools are attached per request by {@code AgentService}; the system prompt is
	 * versioned in the repository and contains no secrets and no authorization rules.
	 */
	@Bean
	ChatClient osChatClient(ChatClient.Builder builder, ChatMemory chatMemory,
			@Value("classpath:prompts/system.st") Resource systemPrompt) {
		return builder.defaultSystem(read(systemPrompt))
			.defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
			.build();
	}

	private static String read(Resource resource) {
		try {
			return resource.getContentAsString(StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

}
