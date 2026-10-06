package com.maximusflow.os.ai.internal.tools;

import java.util.UUID;

import com.maximusflow.os.common.ui.UiAction;

/**
 * Where one agent turn goes as it happens: the text as the model writes it, the start of a reasoning
 * block, what the tools do and what screen to open. {@link #isOpen()} turns false once the person
 * stopped the turn or left: the turn then ends at its next step, before any further model call or tool.
 *
 * <p>Tool events carry the id of the call they belong to, so a client matches the start and the end
 * of the same call even when one tool runs twice in a turn.
 */
public interface TurnListener {

	/** Whether anyone still wants the turn. */
	boolean isOpen();

	void token(String text);

	/** The model began a reasoning block; the reasoning itself stays with the provider. */
	void thinking();

	void tool(UUID callId, ToolEvents.Event event);

	void ui(UiAction action);

}
