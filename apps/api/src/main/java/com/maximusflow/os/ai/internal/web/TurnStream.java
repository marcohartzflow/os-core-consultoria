package com.maximusflow.os.ai.internal.web;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.ai.internal.tools.TurnCancelledException;
import com.maximusflow.os.ai.internal.tools.TurnListener;
import com.maximusflow.os.common.ui.UiAction;

import org.jspecify.annotations.Nullable;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * One agent turn as Server-Sent Events. Frames: {@code token}, {@code thinking}, {@code tool_start},
 * {@code tool_call}, {@code tool_failed}, {@code action_pending}, {@code action_auto} (tool events
 * carry {@code callId}), {@code ui_action}, then exactly one of {@code done} or {@code error}.
 *
 * <p>{@code SseEmitter.send} is thread-safe (Spring Framework reference, "Asynchronous Requests"):
 * every frame goes out whole, whichever thread writes it. A comment line every
 * {@value #HEARTBEAT_SECONDS} s keeps proxies from closing the stream while a tool runs or the model
 * reasons in silence (the Next.js rewrite proxy closes a socket idle for 30 s) and is how a client
 * that left is noticed. A failed write marks the stream closed; the turn then stops at its next step
 * ({@link #isOpen()}), before any further model call or tool.
 */
final class TurnStream implements TurnListener {

	static final long HEARTBEAT_SECONDS = 15;

	/** Past the turn's own timeout, so the turn ends with an {@code error} frame rather than a cut. */
	private static final Duration EMITTER_GRACE = Duration.ofSeconds(30);

	private final SseEmitter emitter;

	private final AtomicBoolean closed = new AtomicBoolean();

	private final @Nullable ScheduledFuture<?> heartbeat;

	TurnStream(Duration turnTimeout, TaskScheduler scheduler) {
		this.emitter = new SseEmitter(turnTimeout.plus(EMITTER_GRACE).toMillis());
		this.emitter.onCompletion(this::close);
		this.emitter.onError((ex) -> close());
		this.emitter.onTimeout(() -> {
			error("A resposta passou do tempo limite. Tente de novo.");
			close();
		});
		this.heartbeat = scheduler.scheduleAtFixedRate(
				() -> write(SseEmitter.event().comment("keep-alive")), Duration.ofSeconds(HEARTBEAT_SECONDS));
	}

	SseEmitter emitter() {
		return this.emitter;
	}

	@Override
	public boolean isOpen() {
		return !this.closed.get();
	}

	@Override
	public void token(String text) {
		writeOrCancel(SseEmitter.event().name("token").data(Map.of("text", text)));
	}

	@Override
	public void thinking() {
		writeOrCancel(SseEmitter.event().name("thinking").data(Map.of()));
	}

	/**
	 * Tool events never throw: a listener runs inside a tool call, and an exception there would mark a
	 * call that succeeded as failed. A failed write only closes the stream; the turn stops at its next step.
	 */
	@Override
	public void tool(UUID callId, ToolEvents.Event event) {
		String call = callId.toString();
		switch (event) {
			case ToolEvents.ToolStarted e ->
				write(SseEmitter.event().name("tool_start").data(Map.of("callId", call, "tool", e.tool())));
			case ToolEvents.ToolCalled e ->
				write(SseEmitter.event().name("tool_call").data(Map.of("callId", call, "tool", e.tool())));
			case ToolEvents.ToolFailed e -> write(SseEmitter.event()
				.name("tool_failed")
				.data(Map.of("callId", call, "tool", e.tool(), "reason", e.reason())));
			case ToolEvents.ActionPending e -> write(SseEmitter.event()
				.name("action_pending")
				.data(Map.of("callId", call, "actionId", e.actionId().toString(), "tool", e.tool(), "summary",
						e.summary(), "arguments", e.arguments())));
			case ToolEvents.ActionAutoAllowed e -> write(SseEmitter.event()
				.name("action_auto")
				.data(Map.of("callId", call, "tool", e.tool(), "summary", e.summary(), "arguments", e.arguments(),
						"scope", e.scope())));
		}
	}

	@Override
	public void ui(UiAction action) {
		switch (action) {
			case UiAction.Navigate n -> write(SseEmitter.event()
				.name("ui_action")
				.data(Map.of("type", "navigate", "path", n.path(), "label", n.label())));
		}
	}

	void done(AgentService.Reply reply) {
		if (write(SseEmitter.event().name("done").data(Map.of("text", reply.text(), "totalTokens", reply.totalTokens())))) {
			this.emitter.complete();
		}
	}

	/** The response is already committed: an error is a frame, not a second HTTP status. */
	void error(String message) {
		if (write(SseEmitter.event().name("error").data(Map.of("message", message)))) {
			this.emitter.complete();
		}
	}

	private void writeOrCancel(SseEmitter.SseEventBuilder frame) {
		if (!write(frame)) {
			throw new TurnCancelledException();
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
			close();
			return false;
		}
	}

	private void close() {
		if (this.closed.compareAndSet(false, true) && this.heartbeat != null) {
			this.heartbeat.cancel(false);
		}
	}

}
