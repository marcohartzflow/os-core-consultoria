package com.maximusflow.os.ai.internal.tools;

import java.util.function.Consumer;

import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * In streaming mode Spring AI executes tool calls on Reactor threads, where the thread-bound
 * security context, audit scope and event listener of the turn are absent. This wrapper captures
 * them when the turn starts and re-establishes them around every call, whatever thread runs it, so
 * {@code @RequiresPermission}, audit origin and SSE events keep working exactly as in blocking mode.
 */
public final class ContextPropagatingToolCallback implements ToolCallback {

	private final ToolCallback delegate;

	private final SecurityContext securityContext;

	private final String conversationId;

	private final @Nullable Consumer<ToolEvents.Event> listener;

	public ContextPropagatingToolCallback(ToolCallback delegate, SecurityContext securityContext,
			String conversationId, @Nullable Consumer<ToolEvents.Event> listener) {
		this.delegate = delegate;
		this.securityContext = securityContext;
		this.conversationId = conversationId;
		this.listener = listener;
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
		SecurityContext previous = SecurityContextHolder.getContext();
		SecurityContextHolder.setContext(this.securityContext);
		try {
			return AuditContext.with(AuditOrigin.AI_TOOL, this.conversationId,
					() -> ToolEvents.listen(this.listener, () -> this.delegate.call(toolInput, toolContext)));
		}
		finally {
			SecurityContextHolder.setContext(previous);
		}
	}

}
