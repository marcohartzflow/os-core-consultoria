package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window limiter keyed by an arbitrary string (client IP). In-memory on purpose: one
 * instance per client deployment. Windows are pruned opportunistically so memory stays bounded.
 */
final class RateLimiter {

	private final int limit;

	private final Duration period;

	private final Clock clock;

	private final ConcurrentHashMap<String, Deque<Instant>> windows = new ConcurrentHashMap<>();

	RateLimiter(int limit, Duration period, Clock clock) {
		this.limit = limit;
		this.period = period;
		this.clock = clock;
	}

	/** Returns true and records the hit when the key is under the limit. */
	boolean tryAcquire(String key) {
		Instant now = this.clock.instant();
		Instant cutoff = now.minus(this.period);
		Deque<Instant> window = this.windows.computeIfAbsent(key, (k) -> new ArrayDeque<>());
		synchronized (window) {
			while (!window.isEmpty() && window.peekFirst().isBefore(cutoff)) {
				window.pollFirst();
			}
			if (window.size() >= this.limit) {
				return false;
			}
			window.addLast(now);
		}
		if (this.windows.size() > 10_000) {
			prune(cutoff);
		}
		return true;
	}

	private void prune(Instant cutoff) {
		this.windows.entrySet().removeIf((entry) -> {
			Deque<Instant> window = entry.getValue();
			synchronized (window) {
				return window.isEmpty() || window.peekLast().isBefore(cutoff);
			}
		});
	}

}
