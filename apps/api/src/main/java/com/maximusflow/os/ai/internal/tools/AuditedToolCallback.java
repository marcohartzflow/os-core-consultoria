package com.maximusflow.os.ai.internal.tools;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.logging.Denials;
import com.maximusflow.os.common.logging.Sanitize;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import org.springframework.security.access.AccessDeniedException;

/**
 * Wraps every tool the agent can call: audits the call (argument names and hash, see {@link ToolArguments}, with
 * the duration or the failure reason) and reports
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
			// A state-changing call only parks a pending action, which audits itself (ai.action.parked);
			// recording it as executed would put a false entry in the trail.
			if (!(this.delegate instanceof ConfirmingToolCallback)) {
				this.audit.record("ai.tool.executed", "ai_tool", name, details(toolInput, "durationMs",
						Duration.between(started, this.clock.instant()).toMillis()));
				ToolEvents.publish(new ToolEvents.ToolCalled(name));
			}
			return result;
		}
		catch (RuntimeException ex) {
			// MethodToolCallback wraps the use case's exception in ToolExecutionException; classify the cause.
			RuntimeException cause = ToolFailures.unwrap(ex);
			String reason = cause.getClass().getSimpleName();
			if (cause instanceof AccessDeniedException denied) {
				security.warn("ai tool denied tool={} rule={}", name, Denials.rule(denied));
			}
			else {
				security.warn("ai tool failed tool={} reason={} message={}", name, reason,
						Sanitize.forLog(cause.getMessage()));
			}
			this.audit.record("ai.tool.failed", "ai_tool", name, details(toolInput, "reason", reason));
			ToolEvents.publish(new ToolEvents.ToolFailed(name, ToolFailures.shownReason(cause)));
			// Rethrown as it came: the ToolCallingManager hands a ToolExecutionException to
			// SafeToolExceptionProcessor, which decides what the model reads.
			throw ex;
		}
	}

	/** Never the argument values: the trail outlives the data they may name (LGPD art. 6 III). */
	private static Map<String, Object> details(String toolInput, String key, Object value) {
		Map<String, Object> details = new HashMap<>(ToolArguments.auditDetails(toolInput));
		details.put(key, value);
		return details;
	}

}
