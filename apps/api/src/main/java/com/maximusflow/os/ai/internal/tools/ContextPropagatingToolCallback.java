package com.maximusflow.os.ai.internal.tools;

import java.util.function.Consumer;
import java.util.function.Supplier;

import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.ui.UiAction;
import com.maximusflow.os.common.ui.UiActions;

import org.jspecify.annotations.Nullable;
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
 * applies to the very next tool call.
 */
public final class ContextPropagatingToolCallback implements ToolCallback {

	private final ToolCallback delegate;

	private final Supplier<SecurityContext> securityContext;

	private final String conversationId;

	private final @Nullable Consumer<ToolEvents.Event> listener;

	private final @Nullable Consumer<UiAction> uiListener;

	public ContextPropagatingToolCallback(ToolCallback delegate, Supplier<SecurityContext> securityContext,
			String conversationId, @Nullable Consumer<ToolEvents.Event> listener,
			@Nullable Consumer<UiAction> uiListener) {
		this.delegate = delegate;
		this.securityContext = securityContext;
		this.conversationId = conversationId;
		this.listener = listener;
		this.uiListener = uiListener;
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
		SecurityContextHolder.setContext(this.securityContext.get());
		try {
			return AuditContext.with(AuditOrigin.AI_TOOL, this.conversationId, () -> ToolEvents.listen(this.listener,
					() -> UiActions.listen(this.uiListener, () -> this.delegate.call(toolInput, toolContext))));
		}
		finally {
			SecurityContextHolder.setContext(previous);
		}
	}

}
