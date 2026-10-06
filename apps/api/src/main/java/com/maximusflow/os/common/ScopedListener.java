package com.maximusflow.os.common;

import java.util.function.Consumer;
import java.util.function.Supplier;

import org.jspecify.annotations.Nullable;

/**
 * A listener bound to the current thread for the duration of a piece of work. Code deep inside a
 * use case publishes without knowing who, if anyone, listens; the caller that drives the work
 * decides. A scope replaces any outer listener (null means "nobody listens here") and restores it
 * afterwards, so nothing leaks between scopes or into pooled threads.
 */
public final class ScopedListener<T> {

	private final ThreadLocal<Consumer<T>> current = new ThreadLocal<>();

	public void publish(T event) {
		Consumer<T> listener = this.current.get();
		if (listener != null) {
			listener.accept(event);
		}
	}

	public <R> R listen(@Nullable Consumer<T> listener, Supplier<R> work) {
		Consumer<T> previous = this.current.get();
		set(listener);
		try {
			return work.get();
		}
		finally {
			set(previous);
		}
	}

	private void set(@Nullable Consumer<T> listener) {
		if (listener != null) {
			this.current.set(listener);
		}
		else {
			this.current.remove();
		}
	}

}
