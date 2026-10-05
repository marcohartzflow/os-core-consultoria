package com.maximusflow.os.ai.internal.tools;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;

import com.maximusflow.os.common.audit.AuditRecorder;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;

/**
 * Stands in for a state-changing tool during the agent turn. Instead of executing, it records a pending
 * action and tells the model to wait. The real call happens in {@code PendingActionService} after the
 * person confirms it. When the person allowed this call beforehand ({@code autoAllowed}, given the
 * call's arguments, names the reach: ONCE, CONVERSATION or ALWAYS; null otherwise), it runs at once
 * and is audited as such, also when it fails.
 */
public final class ConfirmingToolCallback implements ToolCallback {

	private final RegisteredTool tool;

	private final BiFunction<RegisteredTool, String, UUID> park;

	private final Function<String, @Nullable String> autoAllowed;

	private final AuditRecorder audit;

	public ConfirmingToolCallback(RegisteredTool tool, BiFunction<RegisteredTool, String, UUID> park,
			Function<String, @Nullable String> autoAllowed, AuditRecorder audit) {
		this.tool = tool;
		this.park = park;
		this.autoAllowed = autoAllowed;
		this.audit = audit;
	}

	@Override
	public ToolDefinition getToolDefinition() {
		return this.tool.callback().getToolDefinition();
	}

	@Override
	public ToolMetadata getToolMetadata() {
		return this.tool.callback().getToolMetadata();
	}

	@Override
	public String call(String toolInput) {
		return call(toolInput, new ToolContext(Map.of()));
	}

	@Override
	public String call(String toolInput, ToolContext toolContext) {
		String scope = this.autoAllowed.apply(toolInput);
		if (scope != null) {
			ToolEvents.publish(new ToolEvents.ToolStarted(this.tool.name()));
			String result;
			try {
				result = this.tool.callback().call(toolInput, toolContext);
			}
			catch (RuntimeException ex) {
				// AuditedToolCallback records the failure; this row says it was a call that ran without asking.
				if (this.tool.requiresConfirmation()) {
					Map<String, Object> failed = new HashMap<>(ToolArguments.auditDetails(toolInput));
					failed.put("scope", scope);
					failed.put("outcome", "failed");
					this.audit.record("ai.action.auto_allowed", "ai_tool", this.tool.name(), failed);
				}
				throw ex;
			}
			Map<String, Object> details = new HashMap<>(ToolArguments.auditDetails(toolInput));
			if (!this.tool.requiresConfirmation()) {
				// A read the person approved: an ordinary read from here on, in the trail and on screen.
				this.audit.record("ai.tool.executed", "ai_tool", this.tool.name(), details);
				ToolEvents.publish(new ToolEvents.ToolCalled(this.tool.name()));
				return result;
			}
			details.put("scope", scope);
			this.audit.record("ai.action.auto_allowed", "ai_tool", this.tool.name(), details);
			ToolEvents.publish(new ToolEvents.ActionAutoAllowed(this.tool.name(), this.tool.confirmationSummary(),
					toolInput, scope));
			return result;
		}
		UUID actionId = this.park.apply(this.tool, toolInput);
		ToolEvents.publish(new ToolEvents.ActionPending(actionId, this.tool.name(), this.tool.confirmationSummary(),
				toolInput));
		return "{\"status\":\"PENDING_CONFIRMATION\",\"actionId\":\"" + actionId
				+ "\",\"message\":\"A ação foi registrada e aguarda confirmação da pessoa no portal. Não repita a chamada.\"}";
	}

}
