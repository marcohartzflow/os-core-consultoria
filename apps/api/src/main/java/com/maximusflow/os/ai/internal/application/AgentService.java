package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.tools.AuditedToolCallback;
import com.maximusflow.os.ai.internal.tools.ConfirmingToolCallback;
import com.maximusflow.os.ai.internal.tools.ContextPropagatingToolCallback;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.TurnCancelledException;
import com.maximusflow.os.ai.internal.tools.TurnListener;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
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

import reactor.core.Exceptions;

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

	/** {@code totalTokens}: what the provider reported for the whole turn, tool rounds included (0 when unknown). */
	public record Reply(String text, long totalTokens) {
	}

	private final AgentModels models;

	private final ToolRegistry registry;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AiProperties properties;

	private final UserDirectory userDirectory;

	private final Clock clock;

	private final ToolPermissionService permissions;

	AgentService(AgentModels models, ToolRegistry registry, ConversationService conversations,
			PendingActionService pendingActions, CurrentUser currentUser, AuditRecorder audit, AiProperties properties,
			UserDirectory userDirectory, Clock clock, ToolPermissionService permissions) {
		this.permissions = permissions;
		this.models = models;
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

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public List<AgentModels.ModelView> availableModels() {
		return this.models.list();
	}

	/**
	 * One agent turn on {@code modelId} (the default model when null; an id outside
	 * {@code os.ai.models} is refused before anything is recorded). Tokens are handed to
	 * {@code onToken} as the model produces them; tool events go to {@code listener}. Blocks the calling thread until the turn ends, so the caller (a virtual
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
	public Reply chat(UUID conversationId, @Nullable String modelId, String userMessage, TurnListener turn) {
		if (userMessage.isBlank() || userMessage.length() > this.properties.maxUserMessageLength()) {
			throw new DomainRuleException("Mensagem vazia ou longa demais");
		}
		AiProperties.Model model = this.models.resolve(modelId);
		this.conversations.touch(conversationId, userMessage);
		return turn(conversationId, model, userMessage, turn);
	}

	/**
	 * The turn after the person confirmed or refused actions (human in the loop): no new message, the
	 * assistant answers from the outcome the portal noted in the conversation. Allowed only while the
	 * conversation ends with such a note, so it never runs twice in a row or without a decision.
	 */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public Reply continueAfterActions(UUID conversationId, @Nullable String modelId, TurnListener turn) {
		AiProperties.Model model = this.models.resolve(modelId);
		// The note becomes the turn's message: taken off the end of memory and sent as the user message,
		// it is stored once again by the memory advisor, not twice.
		String note = this.conversations.takePortalNote(conversationId)
			.orElseThrow(() -> new DomainRuleException("Nada a continuar nesta conversa"));
		this.conversations.touch(conversationId, "");
		return turn(conversationId, model, note, turn);
	}

	private Reply turn(UUID conversationId, AiProperties.Model model, String userMessage, TurnListener turn) {
		OsPrincipal actor = this.currentUser.require();
		String id = conversationId.toString();
		// Tool calls run on Reactor threads: they get the client address and log context of the
		// request that started the turn (captured by the caller on the request thread).
		String clientIp = AuditContext.current().map(AuditContext.Scope::ip).orElse(null);
		Map<String, String> logContext = MDC.getCopyOfContextMap();

		// Actions the person allowed beforehand run without asking, up to a cap per turn; past it they ask.
		AtomicInteger autoLeft = new AtomicInteger(this.properties.maxAutoActionsPerTurn());
		Set<String> blocked = this.permissions.blocked(actor.getId());
		Set<String> askFirst = this.permissions.askFirst(actor.getId());
		List<ToolCallback> callbacks = toolsFor(actor).stream()
			// A tool the person blocked is not offered at all.
			.filter((tool) -> !blocked.contains(tool.name()))
			.map((tool) -> new ContextPropagatingToolCallback(wrap(tool, conversationId, actor.getId(), autoLeft,
					askFirst.contains(tool.name())),
					() -> currentContext(actor.getId()), id, turn, clientIp, logContext))
			.map(ToolCallback.class::cast)
			.toList();
		this.audit.record("ai.turn.started", "ai_conversation", id,
				Map.of("tools", callbacks.size(), "model", model.id()));

		StringBuilder full = new StringBuilder();
		// One "thinking" signal per reasoning block: set on its first chunk, cleared by any other chunk.
		AtomicBoolean thinking = new AtomicBoolean();
		AtomicReference<@Nullable Usage> usage = new AtomicReference<>();
		boolean completed = false;
		try {
			// Each chunk is handled on the thread that produced it, in the order of the Flux, so text and
			// tool events reach the client in the order they happened. Throwing from the handler (the
			// person stopped, or left) cancels the subscription: the model call and any further tool
			// round stop with it. The timeout cancels the same way.
			this.models.clientFor(model)
				.prompt()
				.options(AgentModels.optionsFor(model))
				.user(userMessage)
				.tools((Object[]) callbacks.toArray(ToolCallback[]::new))
				.toolContext(Map.of("conversationId", id))
				.advisors((a) -> a.param(ChatMemory.CONVERSATION_ID, id))
				.stream()
				.chatResponse()
				.doOnNext((response) -> {
					if (!turn.isOpen()) {
						throw new TurnCancelledException();
					}
					Usage reported = response.getMetadata().getUsage();
					if (!UsageCalculator.isEmpty(reported)) {
						usage.set(reported);
					}
					if (isThinking(response)) {
						if (thinking.compareAndSet(false, true)) {
							turn.thinking();
						}
						return;
					}
					thinking.set(false);
					String token = text(response);
					if (!token.isEmpty()) {
						full.append(token);
						turn.token(token);
					}
				})
				.timeout(this.properties.turnTimeout())
				.blockLast();
			completed = true;
		}
		catch (RuntimeException ex) {
			// blockLast wraps checked failures (a TimeoutException); unwrap so callers see the cause.
			Throwable cause = Exceptions.unwrap(ex);
			if (cause instanceof TimeoutException timeout) {
				throw new TurnTimedOutException(timeout);
			}
			throw (cause instanceof RuntimeException runtime) ? runtime : ex;
		}
		finally {
			recordEnd(id, completed, usage.get());
		}
		Usage reported = usage.get();
		Integer total = (reported != null) ? reported.getTotalTokens() : null;
		return new Reply(full.toString(), (total != null) ? total : 0);
	}

	/**
	 * A chunk of the model's reasoning. Spring AI's Anthropic model marks each thinking delta with the
	 * {@code thinking} property and carries no text in it; the reasoning itself is never sent on.
	 */
	private static boolean isThinking(ChatResponse response) {
		return Optional.ofNullable(response.getResult())
			.map(Generation::getOutput)
			.map((output) -> Boolean.TRUE.equals(output.getMetadata().get("thinking")))
			.orElse(false);
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

	private @Nullable String autoAllowed(RegisteredTool tool, UUID conversationId, UUID actorId,
			AtomicInteger autoLeft, String arguments) {
		// The cap counts actions only: a read the person approved is not an action run without asking.
		if (tool.requiresConfirmation() && autoLeft.get() <= 0) {
			return null;
		}
		ToolPermissionService.Scope scope = this.permissions.autoAllowed(actorId, tool, conversationId, arguments);
		if (scope == null) {
			return null;
		}
		// A read approved by the person does not count against the cap of actions run without asking.
		if (tool.requiresConfirmation() && autoLeft.getAndDecrement() <= 0) {
			return null;
		}
		return scope.name();
	}

	private List<RegisteredTool> toolsFor(OsPrincipal actor) {
		Set<String> permissions = actor.getAuthorities().stream().map(GrantedAuthority::getAuthority)
			.collect(Collectors.toSet());
		return this.registry.forPermissions(permissions);
	}

	private ToolCallback wrap(RegisteredTool tool, UUID conversationId, UUID actorId, AtomicInteger autoLeft,
			boolean askFirst) {
		// An action asks by nature; a read asks when the person chose so.
		ToolCallback inner = (tool.requiresConfirmation() || askFirst)
				? new ConfirmingToolCallback(tool, (t, args) -> this.pendingActions.park(conversationId, t, args),
						(arguments) -> autoAllowed(tool, conversationId, actorId, autoLeft, arguments), this.audit)
				: tool.callback();
		return new AuditedToolCallback(inner, this.audit, this.clock);
	}

}
