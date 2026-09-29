package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTests {

	@Test
	void allowsUpToLimitThenBlocksUntilWindowSlides() {
		Instant start = Instant.parse("2026-09-28T12:00:00Z");
		MutableClock clock = new MutableClock(start);
		RateLimiter limiter = new RateLimiter(3, Duration.ofMinutes(1), clock);

		assertThat(limiter.tryAcquire("ip")).isTrue();
		assertThat(limiter.tryAcquire("ip")).isTrue();
		assertThat(limiter.tryAcquire("ip")).isTrue();
		assertThat(limiter.tryAcquire("ip")).isFalse();
		assertThat(limiter.tryAcquire("other")).isTrue();

		clock.now = start.plusSeconds(61);
		assertThat(limiter.tryAcquire("ip")).isTrue();
	}

	@Test
	void ipv6ClientsShareOneWindowPerSlash64() {
		MutableClock clock = new MutableClock(Instant.parse("2026-09-28T12:00:00Z"));
		RateLimiter limiter = new RateLimiter(2, Duration.ofMinutes(1), clock);

		assertThat(limiter.tryAcquire("2001:db8:1:2::1")).isTrue();
		assertThat(limiter.tryAcquire("2001:DB8:1:2:ffff::9")).isTrue();
		assertThat(limiter.tryAcquire("2001:db8:1:2:0:0:0:3")).isFalse();
		assertThat(limiter.tryAcquire("2001:db8:1:3::1")).isTrue();
		assertThat(RateLimiter.normalize("::1")).isEqualTo("0:0:0:0::/64");
		assertThat(RateLimiter.normalize("10.0.0.1")).isEqualTo("10.0.0.1");
		assertThat(RateLimiter.normalize("not:an:address")).isEqualTo("not:an:address");
	}

	@Test
	void idleWindowsArePrunedWithoutLosingHits() {
		Instant start = Instant.parse("2026-09-28T12:00:00Z");
		MutableClock clock = new MutableClock(start);
		RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1), clock);
		for (int i = 0; i < 20_000; i++) {
			assertThat(limiter.tryAcquire("k" + i)).isTrue();
		}
		clock.now = start.plusSeconds(120);
		assertThat(limiter.tryAcquire("k1")).isTrue();
		assertThat(limiter.tryAcquire("k1")).isFalse();
	}

	static final class MutableClock extends Clock {

		Instant now;

		MutableClock(Instant now) {
			this.now = now;
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return this.now;
		}

	}

}
