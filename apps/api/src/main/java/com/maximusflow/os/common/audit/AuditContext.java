package com.maximusflow.os.common.audit;

import java.util.Optional;
import java.util.function.Supplier;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped attribution for audit entries. The AI module opens a scope while executing a tool so
 * every audit row written by the use case (and by the tool wrapper) carries {@link AuditOrigin#AI_TOOL}
 * and the conversation id, even when the work runs outside an HTTP request thread.
 */
public final class AuditContext {

	public record Scope(AuditOrigin origin, @Nullable String correlationId) {
	}

	private static final ThreadLocal<Scope> CURRENT = new ThreadLocal<>();

	private AuditContext() {
	}

	public static Optional<Scope> current() {
		return Optional.ofNullable(CURRENT.get());
	}

	public static <T> T with(AuditOrigin origin, @Nullable String correlationId, Supplier<T> work) {
		Scope previous = CURRENT.get();
		CURRENT.set(new Scope(origin, correlationId));
		try {
			return work.get();
		}
		finally {
			if (previous != null) {
				CURRENT.set(previous);
			}
			else {
				CURRENT.remove();
			}
		}
	}

}
