package com.maximusflow.os.ai.internal.web;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.common.error.RateLimitedException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.ui.UiAction;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.concurrent.DelegatingSecurityContextRunnable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai")
class AiController {

	private static final Logger log = LoggerFactory.getLogger(AiController.class);

	record CreateConversationRequest(@Nullable @Size(max = 200) String title) {
	}

	record MessageRequest(@NotBlank @Size(max = AgentService.MAX_USER_MESSAGE_LENGTH) String text) {
	}

	private final AgentService agent;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final AsyncTaskExecutor executor;

	private final CurrentUser currentUser;

	private final AiProperties properties;

	private final ConcurrentHashMap<UUID, AtomicInteger> inFlight = new ConcurrentHashMap<>();

	AiController(AgentService agent, ConversationService conversations, PendingActionService pendingActions,
			AsyncTaskExecutor applicationTaskExecutor, CurrentUser currentUser, AiProperties properties) {
		this.agent = agent;
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

	@DeleteMapping("/conversations/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable UUID id) {
		this.conversations.delete(id);
	}

	@GetMapping("/conversations/{id}/actions")
	List<PendingActionService.PendingActionView> openActions(@PathVariable UUID id) {
		return this.pendingActions.open(id);
	}

	/**
	 * One agent turn as a Server-Sent Events stream: {@code token} as the model writes, interleaved
	 * with {@code tool_call}, {@code tool_failed}, {@code action_pending} and {@code ui_action}; then {@code done} with
	 * the full text (or {@code error}). The turn runs on a virtual thread carrying the caller's
	 * security context. It ends when the client goes away or the turn timeout passes, and one person
	 * runs at most {@code os.ai.max-concurrent-turns-per-user} turns at a time.
	 */
	@PostMapping(value = "/conversations/{id}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	SseEmitter send(@PathVariable UUID id, @Valid @RequestBody MessageRequest body) {
		UUID userId = this.currentUser.require().getId();
		AtomicInteger running = this.inFlight.computeIfAbsent(userId, (k) -> new AtomicInteger());
		if (running.incrementAndGet() > this.properties.maxConcurrentTurnsPerUser()) {
			running.decrementAndGet();
			throw new RateLimitedException("Aguarde a resposta anterior terminar");
		}
		Sink sink = new Sink(new SseEmitter(this.properties.turnTimeout().toMillis()));
		Runnable turn = () -> {
			try {
				AgentService.Reply reply = this.agent.chat(id, body.text(), sink::event, sink::uiAction, sink::token);
				sink.done(reply.text());
			}
			catch (Sink.ClientGone ex) {
				log.debug("agent turn abandoned conversation={}", id);
			}
			catch (Exception ex) {
				log.warn("agent turn failed conversation={} reason={}", id, ex.getClass().getSimpleName());
				sink.error(userFacing(ex));
			}
			finally {
				running.decrementAndGet();
			}
		};
		this.executor.execute(new DelegatingSecurityContextRunnable(turn));
		return sink.emitter;
	}

	/**
	 * Writes SSE frames. Tool listeners run on the model's threads inside a tool call and must never
	 * throw (an exception there would mark a successful tool as failed), so they only note that the
	 * client is gone; the token loop, which runs on the turn's own thread, then stops the turn.
	 */
	private static final class Sink {

		static final class ClientGone extends RuntimeException {

			ClientGone() {
				super("SSE client disconnected", null, false, false);
			}

		}

		private final SseEmitter emitter;

		private final AtomicBoolean closed = new AtomicBoolean();

		Sink(SseEmitter emitter) {
			this.emitter = emitter;
			emitter.onCompletion(() -> this.closed.set(true));
			emitter.onTimeout(() -> {
				this.closed.set(true);
				emitter.complete();
			});
			emitter.onError((ex) -> this.closed.set(true));
		}

		void token(String token) {
			if (!write(SseEmitter.event().name("token").data(Map.of("text", token)))) {
				throw new ClientGone();
			}
		}

		void event(ToolEvents.Event event) {
			switch (event) {
				case ToolEvents.ToolCalled e -> write(SseEmitter.event().name("tool_call").data(Map.of("tool", e.tool())));
				case ToolEvents.ToolFailed e -> write(
						SseEmitter.event().name("tool_failed").data(Map.of("tool", e.tool(), "reason", e.reason())));
				case ToolEvents.ActionPending e -> write(SseEmitter.event().name("action_pending")
					.data(Map.of("actionId", e.actionId().toString(), "tool", e.tool(), "summary", e.summary())));
			}
		}

		void uiAction(UiAction action) {
			switch (action) {
				case UiAction.Navigate n -> write(SseEmitter.event().name("ui_action")
					.data(Map.of("type", "navigate", "path", n.path(), "label", n.label())));
			}
		}

		void done(String text) {
			if (write(SseEmitter.event().name("done").data(Map.of("text", text)))) {
				this.emitter.complete();
			}
		}

		/** The response is already committed: an error is a frame, not a second HTTP status. */
		void error(String message) {
			if (write(SseEmitter.event().name("error").data(Map.of("message", message)))) {
				this.emitter.complete();
			}
		}

		private boolean write(SseEmitter.SseEventBuilder frame) {
			if (this.closed.get()) {
				return false;
			}
			try {
				this.emitter.send(frame);
				return true;
			}
			catch (IOException | IllegalStateException ex) {
				this.closed.set(true);
				return false;
			}
		}

	}

	@PostMapping("/actions/{id}/confirm")
	PendingActionService.PendingActionView confirm(@PathVariable UUID id) {
		return this.pendingActions.confirm(id);
	}

	@PostMapping("/actions/{id}/reject")
	PendingActionService.PendingActionView reject(@PathVariable UUID id) {
		return this.pendingActions.reject(id);
	}

	private static String userFacing(Exception ex) {
		if (ex instanceof RateLimitedException || ex instanceof com.maximusflow.os.common.error.DomainRuleException
				|| ex instanceof com.maximusflow.os.common.error.NotFoundException) {
			return String.valueOf(ex.getMessage());
		}
		if (ex instanceof org.springframework.security.access.AccessDeniedException) {
			return "Você não tem permissão para usar o assistente";
		}
		return "O assistente não conseguiu responder agora. Tente de novo em instantes";
	}

}
