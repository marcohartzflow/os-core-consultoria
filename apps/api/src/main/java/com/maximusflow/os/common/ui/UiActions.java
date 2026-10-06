package com.maximusflow.os.common.ui;

import java.util.function.Consumer;
import java.util.function.Supplier;

import com.maximusflow.os.common.ScopedListener;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped channel for {@link UiAction}s. A use case calls {@link #publish} without knowing
 * whether it runs from REST (no listener, the action is dropped) or from the agent (the AI module
 * listens and forwards the action to the portal over SSE).
 */
public final class UiActions {

	private static final ScopedListener<UiAction> LISTENER = new ScopedListener<>();

	private UiActions() {
	}

	public static void publish(UiAction action) {
		LISTENER.publish(action);
	}

	public static <T> T listen(@Nullable Consumer<UiAction> listener, Supplier<T> work) {
		return LISTENER.listen(listener, work);
	}

}
