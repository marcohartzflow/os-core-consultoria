package com.maximusflow.os.ai.internal.tools;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.logging.Sanitize;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;

/**
 * Wraps every tool the agent can call: audits the call (arguments, outcome, duration) and reports
 * progress through {@link ToolEvents}. Authorization is not done here; the use case's own
 * {@code @RequiresPermission} runs inside the delegate, so a hallucinated or stale call still fails.
 */
public final class AuditedToolCallback implements ToolCallback {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final ToolCallback delegate;

	private final AuditRecorder audit;

	private final Clock clock;

	public AuditedToolCallback(ToolCallback delegate, AuditRecorder audit, Clock clock) {
		this.delegate = delegate;
		this.audit = audit;
		this.clock = clock;
	}

	@Override
	public ToolDefinition getToolDefinition() {
		return this.delegate.getToolDefinition();
	}

	@Override
	public ToolMetadata getToolMetadata() {
		return this.delegate.getToolMetadata();
	}

	@Override
	public String call(String toolInput) {
		return call(toolInput, new ToolContext(Map.of()));
	}

	@Override
	public String call(String toolInput, ToolContext toolContext) {
		String name = getToolDefinition().name();
		Instant started = this.clock.instant();
		try {
			String result = this.delegate.call(toolInput, toolContext);
			// A destructive call only parks a pending action, which audits itself (ai.action.parked);
			// recording it as executed would put a false entry in the trail.
			if (!(this.delegate instanceof ConfirmingToolCallback)) {
				this.audit.record("ai.tool.executed", "ai_tool", name, Map.of("arguments", toolInput, "durationMs",
						Duration.between(started, this.clock.instant()).toMillis()));
				ToolEvents.publish(new ToolEvents.ToolCalled(name));
			}
			return result;
		}
		catch (RuntimeException ex) {
			String reason = ex.getClass().getSimpleName();
			security.warn("ai tool failed tool={} reason={} message={}", name, reason,
					Sanitize.forLog(ex.getMessage()));
			this.audit.record("ai.tool.failed", "ai_tool", name, Map.of("arguments", toolInput, "reason", reason));
			ToolEvents.publish(new ToolEvents.ToolFailed(name, reason));
			throw ex;
		}
	}

}
