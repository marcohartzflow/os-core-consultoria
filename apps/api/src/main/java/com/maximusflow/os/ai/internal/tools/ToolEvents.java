package com.maximusflow.os.ai.internal.tools;

import java.util.UUID;
import java.util.function.Consumer;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped listener so tool wrappers can report progress to whoever is driving the agent turn
 * (the SSE controller). Tools run on the same thread as the chat call.
 */
public final class ToolEvents {

	public sealed interface Event permits ToolCalled, ToolFailed, ActionPending {
	}

	public record ToolCalled(String tool) implements Event {
	}

	public record ToolFailed(String tool, String reason) implements Event {
	}

	public record ActionPending(UUID actionId, String tool, String summary) implements Event {
	}

	private static final ThreadLocal<Consumer<Event>> LISTENER = new ThreadLocal<>();

	private ToolEvents() {
	}

	public static void publish(Event event) {
		Consumer<Event> listener = LISTENER.get();
		if (listener != null) {
			listener.accept(event);
		}
	}

	public static <T> T listen(@Nullable Consumer<Event> listener, java.util.function.Supplier<T> work) {
		Consumer<Event> previous = LISTENER.get();
		if (listener != null) {
			LISTENER.set(listener);
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
