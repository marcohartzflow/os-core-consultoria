package com.maximusflow.os.ai.internal.application;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.AiProvider;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.InvalidRequestException;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.openai.OpenAiChatOptions;

/**
 * The models a person may pick: the configured list ({@code os.ai.models}) narrowed to providers
 * that have a chat model and an API key. Each provider has one {@link ChatClient} with the portal's
 * system prompt and conversation memory; the model id goes on each request as an option, so a
 * conversation can change model between turns and keeps its memory.
 */
public final class AgentModels {

	/** {@code isDefault} keeps its published name: true for the model used when the request names none. */
	public record ModelView(String id, String provider, String name, String description, String context,
			boolean isDefault) {
	}

	private final List<AiProperties.Model> available;

	private final Map<AiProvider, ChatClient> clients;

	public AgentModels(List<AiProperties.Model> configured, Map<AiProvider, ChatClient> clients) {
		this.available = configured.stream().filter((m) -> clients.containsKey(m.provider())).toList();
		this.clients = Map.copyOf(clients);
	}

	public List<ModelView> list() {
		return this.available.stream()
			.map((m) -> new ModelView(m.id(), m.provider().name().toLowerCase(Locale.ROOT), m.name(),
					m.description(), m.context(), m == this.available.getFirst()))
			.toList();
	}

	/** The model named by the request, or the default; an id outside the list is refused, never forwarded. */
	public AiProperties.Model resolve(@Nullable String id) {
		if (this.available.isEmpty()) {
			// No provider has an API key: the deploy is missing configuration, not the request.
			throw new DomainRuleException("O assistente ainda não foi configurado. Avise um administrador.");
		}
		if (id == null || id.isBlank()) {
			return this.available.getFirst();
		}
		return this.available.stream()
			.filter((m) -> m.id().equals(id))
			.findFirst()
			.orElseThrow(() -> new InvalidRequestException("Modelo indisponível"));
	}

	ChatClient clientFor(AiProperties.Model model) {
		return this.clients.get(model.provider());
	}

	static ChatOptions.Builder<?> optionsFor(AiProperties.Model model) {
		return switch (model.provider()) {
			case ANTHROPIC -> AnthropicChatOptions.builder().model(model.id());
			case OPENAI -> OpenAiChatOptions.builder().model(model.id());
		};
	}

}
