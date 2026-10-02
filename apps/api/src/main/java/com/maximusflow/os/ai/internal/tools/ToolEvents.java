package com.maximusflow.os.ai.internal.tools;

import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;

import com.maximusflow.os.common.ScopedListener;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped listener so tool wrappers can report progress to whoever is driving the agent turn
 * (the SSE controller). {@link ContextPropagatingToolCallback} re-binds it on the thread that runs
 * each tool call.
 */
public final class ToolEvents {

	public sealed interface Event permits ToolCalled, ToolFailed, ActionPending {
	}

	public record ToolCalled(String tool) implements Event {
	}

	public record ToolFailed(String tool, String reason) implements Event {
	}

	/** {@code arguments} is the call as the model made it, shown to the person before they confirm. */
	public record ActionPending(UUID actionId, String tool, String summary, String arguments) implements Event {
	}

	private static final ScopedListener<Event> LISTENER = new ScopedListener<>();

	private ToolEvents() {
	}

	public static void publish(Event event) {
		LISTENER.publish(event);
	}

	public static <T> T listen(@Nullable Consumer<Event> listener, Supplier<T> work) {
		return LISTENER.listen(listener, work);
	}

}
