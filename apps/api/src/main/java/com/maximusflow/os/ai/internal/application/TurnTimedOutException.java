package com.maximusflow.os.ai.internal.application;

import java.util.concurrent.TimeoutException;

/** The turn took longer than {@code os.ai.turn-timeout}; the model call and its tools were cancelled. */
public final class TurnTimedOutException extends RuntimeException {

	TurnTimedOutException(TimeoutException cause) {
		super("agent turn timed out", cause);
	}

}
