package com.maximusflow.os.ai.internal.tools;

import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;

import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.ui.UiAction;
import com.maximusflow.os.common.ui.UiActions;

import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * In streaming mode Spring AI executes tool calls on Reactor threads, where the thread-bound
 * security context, audit scope and event listener of the turn are absent. This wrapper
 * re-establishes them around every call, whatever thread runs it, so {@code @RequiresPermission},
 * audit origin and SSE events keep working exactly as in blocking mode. The security context is
 * obtained afresh for each call: a permission revoked or an account disabled while the turn runs
 * applies to the very next tool call. The client address and the log context (MDC: request id,
 * client IP) of the request that started the turn are carried too, so the tool's audit rows and log
 * lines say where the call came from (OWASP ASVS 5.0 16.2.1).
 */
public final class ContextPropagatingToolCallback implements ToolCallback {

	private final ToolCallback delegate;

	private final Supplier<SecurityContext> securityContext;

	private final String conversationId;

	private final @Nullable TurnListener turn;

	private final @Nullable String clientIp;

	private final @Nullable Map<String, String> logContext;

	public ContextPropagatingToolCallback(ToolCallback delegate, Supplier<SecurityContext> securityContext,
			String conversationId, @Nullable TurnListener turn) {
		this(delegate, securityContext, conversationId, turn, null, null);
	}

	public ContextPropagatingToolCallback(ToolCallback delegate, Supplier<SecurityContext> securityContext,
			String conversationId, @Nullable TurnListener turn, @Nullable String clientIp,
			@Nullable Map<String, String> logContext) {
		this.delegate = delegate;
		this.securityContext = securityContext;
		this.conversationId = conversationId;
		this.turn = turn;
		this.clientIp = clientIp;
		this.logContext = logContext;
	}

	@Override
	public ToolDefinition getToolDefinition() {
		return this.delegate.getToolDefinition();
	}

	@Override
	public String call(String toolInput) {
		return call(toolInput, null);
	}

	@Override
	public String call(String toolInput, @Nullable ToolContext toolContext) {
		// Stopped or abandoned: no tool runs after that, not even an action the person allowed.
		if (this.turn != null && !this.turn.isOpen()) {
			throw new TurnCancelledException();
		}
		UUID callId = UUID.randomUUID();
		Consumer<ToolEvents.Event> events = (this.turn != null) ? (event) -> this.turn.tool(callId, event) : null;
		Consumer<UiAction> ui = (this.turn != null) ? this.turn::ui : null;
		SecurityContext previous = SecurityContextHolder.getContext();
		Map<String, String> previousLogContext = MDC.getCopyOfContextMap();
		SecurityContextHolder.setContext(this.securityContext.get());
		if (this.logContext != null) {
			MDC.setContextMap(this.logContext);
		}
		try {
			return AuditContext.with(AuditOrigin.AI_TOOL, this.conversationId, this.clientIp,
					() -> ToolEvents.listen(events, () -> UiActions.listen(ui,
							() -> this.delegate.call(toolInput, toolContext))));
		}
		finally {
			SecurityContextHolder.setContext(previous);
			if (this.logContext != null) {
				if (previousLogContext != null) {
					MDC.setContextMap(previousLogContext);
				}
				else {
					MDC.clear();
				}
			}
		}
	}

}
