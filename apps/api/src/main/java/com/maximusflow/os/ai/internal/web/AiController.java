package com.maximusflow.os.ai.internal.web;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.application.AgentModels;
import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.application.ToolPermissionService;
import com.maximusflow.os.ai.internal.application.TurnTimedOutException;
import com.maximusflow.os.ai.internal.tools.TurnCancelledException;
import com.maximusflow.os.common.RateLimiter;
import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.error.ConflictException;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.error.RateLimitedException;
import com.maximusflow.os.common.logging.RequestLoggingContextFilter;
import com.maximusflow.os.common.security.CurrentUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.concurrent.DelegatingSecurityContextRunnable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai")
class AiController {

	private static final Logger log = LoggerFactory.getLogger(AiController.class);

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	record CreateConversationRequest(@Nullable @Size(max = 200) String title) {
	}

	record RenameConversationRequest(@NotBlank @Size(max = 200) String title) {
	}

	/**
	 * The configured {@code os.ai.max-user-message-length} is applied by {@link AgentService}. {@code model}
	 * is one id of {@code GET /api/ai/models}; without it the default model answers.
	 */
	record MessageRequest(@NotBlank @Size(max = AiProperties.MAX_USER_MESSAGE_LENGTH_CEILING) String text,
			@Nullable @Size(max = 100) String model) {
	}

	private final AgentService agent;

	private final AgentModels models;

	private final ToolPermissionService toolPermissions;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final AsyncTaskExecutor executor;

	private final CurrentUser currentUser;

	private final AiProperties properties;

	private final ConcurrentHashMap<UUID, AtomicInteger> inFlight = new ConcurrentHashMap<>();

	/** Conversations with a turn running: one at a time each (Spring AI rewrites a conversation's memory). */
	private final Set<UUID> runningConversations = ConcurrentHashMap.newKeySet();

	private final TaskScheduler scheduler;

	/** Turns started per person per minute (OWASP LLM10, ASVS 5.0 15.2.2), on top of the concurrency cap. */
	private final RateLimiter turnsPerMinute;

	AiController(AgentService agent, AgentModels models, ConversationService conversations,
			PendingActionService pendingActions, ToolPermissionService toolPermissions,
			AsyncTaskExecutor applicationTaskExecutor, TaskScheduler taskScheduler, CurrentUser currentUser,
			AiProperties properties, Clock clock) {
		this.scheduler = taskScheduler;
		this.toolPermissions = toolPermissions;
		this.turnsPerMinute = new RateLimiter(properties.turnsPerMinute(), Duration.ofMinutes(1), clock);
		this.agent = agent;
		this.models = models;
		this.conversations = conversations;
		this.pendingActions = pendingActions;
		this.executor = applicationTaskExecutor;
		this.currentUser = currentUser;
		this.properties = properties;
	}

	@GetMapping("/tools")
	List<AgentService.ToolView> tools() {
		return this.agent.availableTools();
	}

	@GetMapping("/models")
	List<AgentModels.ModelView> models() {
		return this.agent.availableModels();
	}

	@GetMapping("/conversations")
	List<ConversationService.ConversationSummary> conversations() {
		return this.conversations.mine();
	}

	@PostMapping("/conversations")
	@ResponseStatus(HttpStatus.CREATED)
	ConversationService.ConversationSummary create(@Valid @RequestBody(required = false) @Nullable CreateConversationRequest body) {
		String title = (body != null && body.title() != null) ? body.title() : "";
		return this.conversations.create(title);
	}

	@GetMapping("/conversations/{id}/messages")
	List<ConversationService.ChatMessage> messages(@PathVariable UUID id) {
		return this.conversations.messages(id);
	}

	@PatchMapping("/conversations/{id}")
	ConversationService.ConversationSummary rename(@PathVariable UUID id,
			@Valid @RequestBody RenameConversationRequest body) {
		return this.conversations.rename(id, body.title());
	}

	@DeleteMapping("/conversations/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable UUID id) {
		requireIdle(id);
		this.conversations.delete(id);
	}

	@GetMapping("/conversations/{id}/actions")
	List<PendingActionService.PendingActionView> openActions(@PathVariable UUID id) {
		return this.pendingActions.open(id);
	}

	/**
	 * One agent turn as a Server-Sent Events stream: {@code token} as the model writes, interleaved
	 * with {@code thinking} (the model started reasoning; no reasoning text), {@code tool_call}, {@code tool_failed}, {@code action_pending} and {@code ui_action}; then {@code done} with
	 * the full text (or {@code error}). The turn runs on a virtual thread carrying the caller's
	 * security context. It ends when the client goes away or the turn timeout passes. One person starts
	 * at most {@code os.ai.turns-per-minute} turns per minute and runs at most
	 * {@code os.ai.max-concurrent-turns-per-user} at a time; beyond either, 429.
	 *
	 * <p>The audit origin, client address and request id are captured here, on the request thread, and
	 * re-established on the turn's thread with the log context (MDC), so the turn's audit rows are
	 * {@code REST} with the person's address and the request id, and its log lines carry
	 * {@code http.request.id} and {@code client.ip} (OWASP ASVS 5.0 16.2.1).
	 */
	@PostMapping(value = "/conversations/{id}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	SseEmitter send(@PathVariable UUID id, @Valid @RequestBody MessageRequest body, HttpServletRequest request,
			HttpServletResponse response) {
		return stream(id, body.model(), request, response,
				(turn) -> this.agent.chat(id, body.model(), body.text(), turn));
	}

	record ContinueRequest(@Nullable @Size(max = 100) String model) {
	}

	/**
	 * The turn after the person confirmed or refused the actions of the last answer: the assistant
	 * reports the outcome without a new message (human in the loop). Same stream, limits and audit
	 * as a message; an {@code error} frame when the conversation does not end with such a decision.
	 */
	@PostMapping(value = "/conversations/{id}/continue", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	SseEmitter continueAfterActions(@PathVariable UUID id,
			@Valid @RequestBody(required = false) @Nullable ContinueRequest body, HttpServletRequest request,
			HttpServletResponse response) {
		String model = (body != null) ? body.model() : null;
		return stream(id, model, request, response, (turn) -> this.agent.continueAfterActions(id, model, turn));
	}

	/**
	 * Admits one agent turn and streams it ({@link TurnStream}). Before anything is spent: the
	 * conversation must be the person's, the model must be offered, and the conversation must not have
	 * a turn running already (two turns would rewrite each other's memory). Then the per-person limits:
	 * {@code os.ai.turns-per-minute} and {@code os.ai.max-concurrent-turns-per-user}; beyond either, 429.
	 *
	 * <p>The turn runs on a virtual thread carrying the caller's security context. The audit origin,
	 * client address and request id are captured here, on the request thread, and re-established on
	 * the turn's thread with the log context (MDC), so the turn's audit rows are {@code REST} with the
	 * person's address and the request id, and its log lines carry {@code http.request.id} and
	 * {@code client.ip} (OWASP ASVS 5.0 16.2.1).
	 */
	private SseEmitter stream(UUID id, @Nullable String modelId, HttpServletRequest request,
			HttpServletResponse response, Function<TurnStream, AgentService.Reply> run) {
		UUID userId = this.currentUser.require().getId();
		this.conversations.checkOwned(id);
		// An unknown model is a 400 here, before the stream starts and before any limit is spent.
		this.models.resolve(modelId);
		if (!this.runningConversations.add(id)) {
			throw new ConflictException("Aguarde a resposta desta conversa terminar");
		}
		AtomicInteger running = this.inFlight.computeIfAbsent(userId, (k) -> new AtomicInteger());
		boolean started = false;
		try {
			if (!this.turnsPerMinute.tryAcquire(userId.toString())) {
				security.warn("ai turn rate limit exceeded user={}", userId);
				throw new RateLimitedException("Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo");
			}
			if (running.incrementAndGet() > this.properties.maxConcurrentTurnsPerUser()) {
				running.decrementAndGet();
				throw new RateLimitedException("Aguarde a resposta anterior terminar");
			}
			String clientIp = request.getRemoteAddr();
			String requestId = RequestLoggingContextFilter.requestId(request);
			Map<String, String> logContext = MDC.getCopyOfContextMap();
			// no-transform: a proxy must pass each frame on as written. Without it the Next.js server's
			// gzip (and any compressing proxy) holds the frames back and the answer arrives all at once.
			// no-store keeps the conversation out of every cache, as for the rest of the API.
			response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, no-transform");
			response.setHeader("X-Accel-Buffering", "no");
			TurnStream stream = new TurnStream(this.properties.turnTimeout(), this.scheduler);
			Runnable turn = () -> {
				if (logContext != null) {
					MDC.setContextMap(logContext);
				}
				try {
					AgentService.Reply reply = AuditContext.with(AuditOrigin.REST, requestId, clientIp,
							() -> run.apply(stream));
					stream.done(reply);
				}
				catch (TurnCancelledException ex) {
					log.debug("agent turn abandoned conversation={}", id);
				}
				catch (RuntimeException ex) {
					log.warn("agent turn failed conversation={} reason={}", id, ex.getClass().getSimpleName());
					stream.error(userFacing(ex));
				}
				finally {
					running.decrementAndGet();
					this.runningConversations.remove(id);
					MDC.clear();
				}
			};
			this.executor.execute(new DelegatingSecurityContextRunnable(turn));
			started = true;
			return stream.emitter();
		}
		finally {
			// Refused before the turn ran (a limit, or the executor): give the slots back.
			if (!started) {
				this.runningConversations.remove(id);
			}
		}
	}

	/** {@code scope}: ONCE (default), CONVERSATION or ALWAYS, within the action's ceiling. */
	record ConfirmRequest(ToolPermissionService.@Nullable Scope scope) {
	}

	@PostMapping("/actions/{id}/confirm")
	PendingActionService.PendingActionView confirm(@PathVariable UUID id,
			@RequestBody(required = false) @Nullable ConfirmRequest body) {
		ToolPermissionService.Scope scope = (body != null && body.scope() != null) ? body.scope()
				: ToolPermissionService.Scope.ONCE;
		requireIdle(this.pendingActions.conversationOf(id));
		return this.pendingActions.confirm(id, scope);
	}

	/** The assistant's Tools settings: each tool the person may use, with their choice and its options. */
	@GetMapping("/tool-preferences")
	List<ToolPermissionService.ToolSetting> toolPreferences() {
		return this.toolPermissions.mine();
	}

	record ToolChoiceRequest(ToolPermissionService.Choice choice) {
	}

	@PutMapping("/tool-preferences/{tool}")
	ToolPermissionService.ToolSetting chooseTool(@PathVariable String tool, @Valid @RequestBody ToolChoiceRequest body) {
		return this.toolPermissions.choose(tool, body.choice());
	}

	/** Back to the defaults: reads run, actions ask. */
	@DeleteMapping("/tool-preferences")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void resetToolPreferences() {
		this.toolPermissions.reset();
	}

	@PostMapping("/actions/{id}/reject")
	PendingActionService.PendingActionView reject(@PathVariable UUID id) {
		requireIdle(this.pendingActions.conversationOf(id));
		return this.pendingActions.reject(id);
	}

	/**
	 * A decision or a deletion waits for the conversation's running turn: the turn rewrites the
	 * conversation's memory when it ends, and would drop the note or bring the conversation back.
	 */
	private void requireIdle(UUID conversationId) {
		if (this.runningConversations.contains(conversationId)) {
			throw new ConflictException("Aguarde a resposta desta conversa terminar");
		}
	}

	/** What the person reads when a turn fails: our own messages as written, a generic text for anything else. */
	private static String userFacing(RuntimeException ex) {
		if (ex instanceof RateLimitedException || ex instanceof DomainRuleException || ex instanceof NotFoundException) {
			return String.valueOf(ex.getMessage());
		}
		if (ex instanceof TurnTimedOutException) {
			return "A resposta passou do tempo limite. Tente de novo.";
		}
		if (ex instanceof AccessDeniedException) {
			return "Você não tem permissão para usar o assistente";
		}
		return "O assistente não conseguiu responder agora. Tente de novo em instantes";
	}

}
