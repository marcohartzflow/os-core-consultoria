package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.tools.AuditedToolCallback;
import com.maximusflow.os.ai.internal.tools.ConfirmingToolCallback;
import com.maximusflow.os.ai.internal.tools.ContextPropagatingToolCallback;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.common.ui.UiAction;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.support.UsageCalculator;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * One agent turn: the model receives only the tools the current person may execute, state-changing
 * tools are replaced by confirmation stubs, every tool call is audited under the conversation id, and
 * the use case's own {@code @RequiresPermission} still runs inside each call.
 */
@Service
public class AgentService {

	private static final Logger log = LoggerFactory.getLogger(AgentService.class);

	/** {@code destructive} keeps its published name: true means the call waits for the person's confirmation. */
	public record ToolView(String name, String description, boolean destructive) {
	}

	public record Reply(String text) {
	}

	private final ChatClient chatClient;

	private final ToolRegistry registry;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AiProperties properties;

	private final UserDirectory userDirectory;

	private final Clock clock;

	AgentService(ChatClient osChatClient, ToolRegistry registry, ConversationService conversations,
			PendingActionService pendingActions, CurrentUser currentUser, AuditRecorder audit, AiProperties properties,
			UserDirectory userDirectory, Clock clock) {
		this.chatClient = osChatClient;
		this.userDirectory = userDirectory;
		this.registry = registry;
		this.conversations = conversations;
		this.pendingActions = pendingActions;
		this.currentUser = currentUser;
		this.audit = audit;
		this.properties = properties;
		this.clock = clock;
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public List<ToolView> availableTools() {
		return toolsFor(this.currentUser.require()).stream()
			.map((t) -> new ToolView(t.name(), t.description(), t.requiresConfirmation())).toList();
	}

	/**
	 * One agent turn. Tokens are handed to {@code onToken} as the model produces them; tool events go
	 * to {@code listener}. Blocks the calling thread until the turn ends, so the caller (a virtual
	 * thread per request) can write SSE frames in order. Tool calls run on Reactor threads with the
	 * turn's security context, audit scope and listener re-established by
	 * {@link ContextPropagatingToolCallback}. No transaction spans the model call: the use cases the
	 * tools invoke open their own.
	 *
	 * <p>The turn is audited twice: {@code ai.turn.started}, and {@code ai.turn.ended} with the outcome
	 * and the token usage the model reported (OWASP LLM10). Usage is read from the {@link ChatResponse}
	 * metadata: Spring AI's {@code ToolCallingAdvisor} stamps the usage of earlier tool-calling rounds onto
	 * every usage-bearing chunk, and Anthropic reports usage on the last event of each model call
	 * ({@code message_delta}), so the last non-empty usage of the stream is the turn's total. An
	 * interrupted turn records what had been reported until then.
	 */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public Reply chat(UUID conversationId, String userMessage, @Nullable Consumer<ToolEvents.Event> listener,
			@Nullable Consumer<UiAction> uiListener, Consumer<String> onToken) {
		if (userMessage.isBlank() || userMessage.length() > this.properties.maxUserMessageLength()) {
			throw new DomainRuleException("Mensagem vazia ou longa demais");
		}
		OsPrincipal actor = this.currentUser.require();
		this.conversations.touch(conversationId, userMessage);
		String id = conversationId.toString();
		// Tool calls run on Reactor threads: they get the client address and log context of the
		// request that started the turn (captured by the caller on the request thread).
		String clientIp = AuditContext.current().map(AuditContext.Scope::ip).orElse(null);
		Map<String, String> logContext = MDC.getCopyOfContextMap();

		List<ToolCallback> callbacks = toolsFor(actor).stream()
			.map((tool) -> new ContextPropagatingToolCallback(wrap(tool, conversationId),
					() -> currentContext(actor.getId()), id, listener, uiListener, clientIp, logContext))
			.map(ToolCallback.class::cast)
			.toList();
		this.audit.record("ai.turn.started", "ai_conversation", id, Map.of("tools", callbacks.size()));

		StringBuilder full = new StringBuilder();
		AtomicReference<@Nullable Usage> usage = new AtomicReference<>();
		boolean completed = false;
		// Closing the stream cancels the subscription: when the caller stops consuming (client gone,
		// timeout, error) the model call and any further tool calls stop with it.
		try (Stream<ChatResponse> responses = this.chatClient.prompt()
			.user(userMessage)
			.tools((Object[]) callbacks.toArray(ToolCallback[]::new))
			.toolContext(Map.of("conversationId", id))
			.advisors((a) -> a.param(ChatMemory.CONVERSATION_ID, id))
			.stream()
			.chatResponse()
			.toStream()) {
			responses.forEach((response) -> {
				Usage reported = response.getMetadata().getUsage();
				if (!UsageCalculator.isEmpty(reported)) {
					usage.set(reported);
				}
				String token = text(response);
				if (!token.isEmpty()) {
					full.append(token);
					onToken.accept(token);
				}
			});
			completed = true;
		}
		finally {
			recordEnd(id, completed, usage.get());
		}
		return new Reply(full.toString());
	}

	/** The same text {@code ChatClient...stream().content()} would emit for this chunk. */
	private static String text(ChatResponse response) {
		String text = Optional.ofNullable(response.getResult())
			.map(Generation::getOutput)
			.map(AssistantMessage::getText)
			.orElse(null);
		return (text != null) ? text : "";
	}

	/**
	 * {@code ai.turn.ended}: outcome and token counts, never the text. After an interrupted turn a
	 * failing audit write must not replace the exception that interrupted it.
	 */
	private void recordEnd(String conversationId, boolean completed, @Nullable Usage usage) {
		Map<String, Object> details = new LinkedHashMap<>();
		details.put("outcome", completed ? "completed" : "interrupted");
		if (usage != null) {
			details.put("promptTokens", usage.getPromptTokens());
			details.put("completionTokens", usage.getCompletionTokens());
			details.put("totalTokens", usage.getTotalTokens());
			if (usage.getCacheReadInputTokens() != null) {
				details.put("cacheReadInputTokens", usage.getCacheReadInputTokens());
			}
			if (usage.getCacheWriteInputTokens() != null) {
				details.put("cacheWriteInputTokens", usage.getCacheWriteInputTokens());
			}
		}
		if (completed) {
			this.audit.record("ai.turn.ended", "ai_conversation", conversationId, details);
			return;
		}
		try {
			this.audit.record("ai.turn.ended", "ai_conversation", conversationId, details);
		}
		catch (RuntimeException ex) {
			log.warn("could not audit the end of an interrupted turn conversation={} reason={}", conversationId,
					ex.getClass().getSimpleName());
		}
	}

	/**
	 * The actor as the directory knows them now, not as they were when the turn started. A disabled
	 * account yields an empty context, so the tool's own authorization refuses the call.
	 */
	private SecurityContext currentContext(UUID actorId) {
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		this.userDirectory.findById(actorId)
			.filter((account) -> account.status() == AccountStatus.ACTIVE)
			.ifPresent((account) -> {
				OsPrincipal principal = new OsPrincipal(account.id(), account.email(), account.name(), null, true, true,
						account.permissions());
				context.setAuthentication(
						UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
			});
		return context;
	}

	private List<RegisteredTool> toolsFor(OsPrincipal actor) {
		Set<String> permissions = actor.getAuthorities().stream().map(GrantedAuthority::getAuthority)
			.collect(Collectors.toSet());
		return this.registry.forPermissions(permissions);
	}

	private ToolCallback wrap(RegisteredTool tool, UUID conversationId) {
		ToolCallback inner = tool.requiresConfirmation()
				? new ConfirmingToolCallback(tool, (t, args) -> this.pendingActions.park(conversationId, t, args))
				: tool.callback();
		return new AuditedToolCallback(inner, this.audit, this.clock);
	}

}
