package com.maximusflow.os.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sliding-window limiter keyed by an arbitrary string (a client address for the auth endpoints, a
 * user id for the assistant's turns). In-memory on purpose: one instance per client deployment. Memory stays bounded: idle windows are pruned at most once per
 * period, and IPv6 clients are keyed by their /64 so one subscriber cannot mint unlimited keys.
 */
public final class RateLimiter {

	private final int limit;

	private final Duration period;

	private final Clock clock;

	private final ConcurrentHashMap<String, Deque<Instant>> windows = new ConcurrentHashMap<>();

	private final AtomicReference<Instant> lastPrune = new AtomicReference<>(Instant.MIN);

	public RateLimiter(int limit, Duration period, Clock clock) {
		this.limit = limit;
		this.period = period;
		this.clock = clock;
	}

	/** Returns true and records the hit when the key is under the limit. */
	public boolean tryAcquire(String rawKey) {
		String key = normalize(rawKey);
		Instant now = this.clock.instant();
		Instant cutoff = now.minus(this.period);
		while (true) {
			Deque<Instant> window = this.windows.computeIfAbsent(key, (k) -> new ArrayDeque<>());
			synchronized (window) {
				// A concurrent prune may have removed this (empty) deque between lookup and lock; retry.
				if (this.windows.get(key) != window) {
					continue;
				}
				while (!window.isEmpty() && window.peekFirst().isBefore(cutoff)) {
					window.pollFirst();
				}
				if (window.size() >= this.limit) {
					return false;
				}
				window.addLast(now);
			}
			pruneOccasionally(now, cutoff);
			return true;
		}
	}

	/** One full sweep per period at most, so a flood of new keys cannot turn every hit into a scan. */
	private void pruneOccasionally(Instant now, Instant cutoff) {
		Instant last = this.lastPrune.get();
		if (Duration.between(last, now).compareTo(this.period) < 0 || !this.lastPrune.compareAndSet(last, now)) {
			return;
		}
		this.windows.entrySet().removeIf((entry) -> {
			Deque<Instant> window = entry.getValue();
			synchronized (window) {
				return window.isEmpty() || window.peekLast().isBefore(cutoff);
			}
		});
	}

	/** IPv6 addresses are limited per /64 (the customary end-site allocation); everything else as is. */
	static String normalize(String key) {
		if (key.indexOf(':') < 0) {
			return key;
		}
		String[] groups = expandIpv6(key);
		return (groups != null) ? String.join(":", groups[0], groups[1], groups[2], groups[3]) + "::/64" : key;
	}

	private static String @org.jspecify.annotations.Nullable [] expandIpv6(String address) {
		String bare = address.startsWith("[") ? address.substring(1, address.lastIndexOf(']')) : address;
		int zone = bare.indexOf('%');
		if (zone >= 0) {
			bare = bare.substring(0, zone);
		}
		String[] halves = bare.split("::", -1);
		if (halves.length > 2) {
			return null;
		}
		String[] head = halves[0].isEmpty() ? new String[0] : halves[0].split(":");
		String[] tail = (halves.length == 2 && !halves[1].isEmpty()) ? halves[1].split(":") : new String[0];
		int missing = 8 - head.length - tail.length;
		if (missing < 0 || (halves.length == 1 && missing != 0)) {
			return null;
		}
		String[] groups = new String[8];
		int i = 0;
		for (String g : head) {
			groups[i++] = g.toLowerCase();
		}
		for (int m = 0; m < missing; m++) {
			groups[i++] = "0";
		}
		for (String g : tail) {
			groups[i++] = g.toLowerCase();
		}
		return groups;
	}

}
