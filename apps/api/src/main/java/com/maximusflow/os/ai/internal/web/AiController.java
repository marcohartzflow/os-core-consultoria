package com.maximusflow.os.ai.internal.web;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.common.error.RateLimitedException;

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

	record MessageRequest(@NotBlank @Size(max = 4000) String text) {
	}

	private final AgentService agent;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final AsyncTaskExecutor executor;

	AiController(AgentService agent, ConversationService conversations, PendingActionService pendingActions,
			AsyncTaskExecutor applicationTaskExecutor) {
		this.agent = agent;
		this.conversations = conversations;
		this.pendingActions = pendingActions;
		this.executor = applicationTaskExecutor;
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
	 * with {@code tool_call}, {@code tool_failed} and {@code action_pending}; then {@code done} with
	 * the full text (or {@code error}). The turn runs on a virtual thread carrying the caller's
	 * security context.
	 */
	@PostMapping(value = "/conversations/{id}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	SseEmitter send(@PathVariable UUID id, @Valid @RequestBody MessageRequest body) {
		SseEmitter emitter = new SseEmitter(0L);
		Runnable turn = () -> {
			try {
				AgentService.Reply reply = this.agent.chat(id, body.text(), (event) -> emit(emitter, event),
						(token) -> emitToken(emitter, token));
				emitter.send(SseEmitter.event().name("done").data(Map.of("text", reply.text())));
				emitter.complete();
			}
			catch (Exception ex) {
				log.warn("agent turn failed conversation={} reason={}", id, ex.getClass().getSimpleName());
				try {
					emitter.send(SseEmitter.event().name("error").data(Map.of("message", userFacing(ex))));
				}
				catch (IOException ignored) {
					// client went away
				}
				emitter.completeWithError(ex);
			}
		};
		this.executor.execute(new DelegatingSecurityContextRunnable(turn));
		return emitter;
	}

	@PostMapping("/actions/{id}/confirm")
	PendingActionService.PendingActionView confirm(@PathVariable UUID id) {
		return this.pendingActions.confirm(id);
	}

	@PostMapping("/actions/{id}/reject")
	PendingActionService.PendingActionView reject(@PathVariable UUID id) {
		return this.pendingActions.reject(id);
	}

	private static void emitToken(SseEmitter emitter, String token) {
		try {
			emitter.send(SseEmitter.event().name("token").data(Map.of("text", token)));
		}
		catch (IOException ex) {
			throw new IllegalStateException("SSE client disconnected", ex);
		}
	}

	private static void emit(SseEmitter emitter, ToolEvents.Event event) {
		try {
			switch (event) {
				case ToolEvents.ToolCalled e -> emitter.send(SseEmitter.event().name("tool_call").data(Map.of("tool", e.tool())));
				case ToolEvents.ToolFailed e -> emitter
					.send(SseEmitter.event().name("tool_failed").data(Map.of("tool", e.tool(), "reason", e.reason())));
				case ToolEvents.ActionPending e -> emitter.send(SseEmitter.event().name("action_pending")
					.data(Map.of("actionId", e.actionId().toString(), "tool", e.tool(), "summary", e.summary())));
			}
		}
		catch (IOException ex) {
			throw new IllegalStateException("SSE client disconnected", ex);
		}
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
