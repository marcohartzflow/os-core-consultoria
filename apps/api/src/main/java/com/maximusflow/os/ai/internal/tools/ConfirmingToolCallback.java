package com.maximusflow.os.ai.internal.tools;

import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;

import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;

/**
 * Stands in for a state-changing tool during the agent turn. Instead of executing, it records a pending
 * action and tells the model to wait. The real call happens in {@code PendingActionService} after the
 * person confirms it.
 */
public final class ConfirmingToolCallback implements ToolCallback {

	private final RegisteredTool tool;

	private final BiFunction<RegisteredTool, String, UUID> park;

	public ConfirmingToolCallback(RegisteredTool tool, BiFunction<RegisteredTool, String, UUID> park) {
		this.tool = tool;
		this.park = park;
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
		UUID actionId = this.park.apply(this.tool, toolInput);
		ToolEvents.publish(new ToolEvents.ActionPending(actionId, this.tool.name(), this.tool.confirmationSummary(),
				toolInput));
		return "{\"status\":\"PENDING_CONFIRMATION\",\"actionId\":\"" + actionId
				+ "\",\"message\":\"A ação foi registrada e aguarda confirmação da pessoa no portal. Não repita a chamada.\"}";
	}

}
