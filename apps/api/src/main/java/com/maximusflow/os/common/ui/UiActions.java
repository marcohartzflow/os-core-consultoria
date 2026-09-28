package com.maximusflow.os.common.ui;

import java.util.function.Consumer;
import java.util.function.Supplier;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped channel for {@link UiAction}s. A use case calls {@link #publish} without knowing
 * whether it runs from REST (no listener, the action is dropped) or from the agent (the AI module
 * listens and forwards the action to the portal over SSE).
 */
public final class UiActions {

	private static final ThreadLocal<Consumer<UiAction>> LISTENER = new ThreadLocal<>();

	private UiActions() {
	}

	public static void publish(UiAction action) {
		Consumer<UiAction> listener = LISTENER.get();
		if (listener != null) {
			listener.accept(action);
		}
	}

	public static <T> T listen(@Nullable Consumer<UiAction> listener, Supplier<T> work) {
		Consumer<UiAction> previous = LISTENER.get();
		if (listener != null) {
			LISTENER.set(listener);
		}
		else {
			LISTENER.remove();
		}
		try {
			return work.get();
		}
		finally {
			if (previous != null) {
				LISTENER.set(previous);
			}
			else {
				LISTENER.remove();
			}
		}
	}

}
