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
