package com.maximusflow.os.ai.internal;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;

import com.maximusflow.os.ai.internal.application.AgentModels;
import com.maximusflow.os.ai.internal.tools.SafeToolExceptionProcessor;

import io.micrometer.observation.ObservationRegistry;

import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.client.advisor.observation.AdvisorObservationConvention;
import org.springframework.ai.chat.client.observation.ChatClientObservationConvention;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.ChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientBuilderConfigurer;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.tool.execution.ToolExecutionExceptionProcessor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.io.Resource;
import org.springframework.util.StringUtils;

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

	@Bean
	ProviderChatModels providerChatModels(ObjectProvider<AnthropicChatModel> anthropic,
			ObjectProvider<OpenAiChatModel> openAi) {
		Map<AiProvider, ChatModel> models = new EnumMap<>(AiProvider.class);
		anthropic.ifAvailable((model) -> models.put(AiProvider.ANTHROPIC, model));
		openAi.ifAvailable((model) -> models.put(AiProvider.OPENAI, model));
		return new ProviderChatModels(models);
	}

	/**
	 * The portal's agent, one {@link ChatClient} per provider that has an API key. Built as the Spring
	 * AI reference shows for several chat models ("Working with Multiple Chat Models"): through
	 * {@link ChatClientBuilderConfigurer}, so customizers and observability still apply. Tools are
	 * attached per request by {@code AgentService}; the system prompt is versioned in the repository
	 * and contains no secrets and no authorization rules.
	 */
	@Bean
	AgentModels agentModels(ProviderChatModels providerChatModels, AiProperties properties, Environment environment,
			ChatMemory chatMemory, @Value("classpath:prompts/system.st") Resource systemPrompt,
			ChatClientBuilderConfigurer configurer, ObjectProvider<ObservationRegistry> observationRegistry,
			ObjectProvider<ChatClientObservationConvention> chatClientObservationConvention,
			ObjectProvider<AdvisorObservationConvention> advisorObservationConvention,
			ObjectProvider<ToolCallingAdvisor.Builder<?>> toolCallingAdvisorBuilder) {
		String system = read(systemPrompt);
		Map<AiProvider, ChatClient> clients = new EnumMap<>(AiProvider.class);
		providerChatModels.models().forEach((provider, model) -> {
			if (!StringUtils.hasText(environment.getProperty(provider.apiKeyProperty()))) {
				return;
			}
			ChatClient.Builder builder = ChatClient.builder(model,
					observationRegistry.getIfUnique(() -> ObservationRegistry.NOOP),
					chatClientObservationConvention.getIfUnique(), advisorObservationConvention.getIfUnique(),
					toolCallingAdvisorBuilder.getIfAvailable());
			clients.put(provider, configurer.configure(builder)
				.defaultSystem(system)
				.defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
				.build());
		});
		return new AgentModels(properties.models(), clients);
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
