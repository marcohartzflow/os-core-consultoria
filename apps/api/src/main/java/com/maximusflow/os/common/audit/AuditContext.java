package com.maximusflow.os.common.audit;

import java.util.Optional;
import java.util.function.Supplier;

import org.jspecify.annotations.Nullable;

/**
 * Thread-scoped attribution for audit entries. The AI module opens a scope while executing a tool so
 * every audit row written by the use case (and by the tool wrapper) carries {@link AuditOrigin#AI_TOOL}
 * and the conversation id, even when the work runs outside an HTTP request thread. Work handed from a
 * request thread to another thread (an agent turn) carries the client address captured on the
 * request thread in {@code ip}, so its rows still say where the action came from (OWASP ASVS 5.0
 * 16.2.1).
 */
public final class AuditContext {

	/** {@code ip} null means "take it from the current HTTP request, if any". */
	public record Scope(AuditOrigin origin, @Nullable String correlationId, @Nullable String ip) {
	}

	private static final ThreadLocal<Scope> CURRENT = new ThreadLocal<>();

	private AuditContext() {
	}

	public static Optional<Scope> current() {
		return Optional.ofNullable(CURRENT.get());
	}

	public static <T> T with(AuditOrigin origin, @Nullable String correlationId, Supplier<T> work) {
		return with(origin, correlationId, null, work);
	}

	public static <T> T with(AuditOrigin origin, @Nullable String correlationId, @Nullable String ip,
			Supplier<T> work) {
		Scope previous = CURRENT.get();
		CURRENT.set(new Scope(origin, correlationId, ip));
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
