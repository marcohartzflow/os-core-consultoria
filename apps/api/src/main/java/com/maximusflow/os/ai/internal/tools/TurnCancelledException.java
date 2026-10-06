package com.maximusflow.os.ai.internal.tools;

/** The turn's listener is gone: nothing more is asked of the model and no further tool runs. */
public final class TurnCancelledException extends RuntimeException {

	public TurnCancelledException() {
		super("agent turn cancelled", null, false, false);
	}

}
