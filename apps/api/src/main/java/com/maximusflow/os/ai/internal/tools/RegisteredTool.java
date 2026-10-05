package com.maximusflow.os.ai.internal.tools;

import com.maximusflow.os.common.security.RequiresConfirmation;

import org.springframework.ai.tool.ToolCallback;

/**
 * A use case exposed to the agent: the Spring AI callback that invokes it (through the Spring proxy,
 * so {@code @RequiresPermission} and {@code @Transactional} apply) plus the authorization metadata
 * used to filter the catalog per user and to route state-changing calls through confirmation.
 */
public record RegisteredTool(String name, String description, String permission, boolean requiresConfirmation,
		String confirmationSummary, RequiresConfirmation.Risk risk, ToolCallback callback) {

}
