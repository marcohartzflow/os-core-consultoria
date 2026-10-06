package com.maximusflow.os.iam.internal.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The lockout follows Keycloak's "by multiples" model and stops for good at the NIST cap. */
class UserLockoutTests {

	private static final LockoutPolicy POLICY = new LockoutPolicy(5, Duration.ofMinutes(15), Duration.ofHours(6),
			Duration.ofHours(12), 100);

	private final Instant start = Instant.parse("2026-10-02T12:00:00Z");

	@Test
	void eachLockWaitsLongerAndTheCountSurvivesTheLocks() {
		User user = User.invite("ana@example.com", "Ana", Set.of());
		Instant now = this.start;
		fail(user, now, 5);
		assertThat(user.getLockedUntil()).isEqualTo(now.plus(Duration.ofMinutes(15)));
		now = user.getLockedUntil();
		fail(user, now, 5);
		assertThat(user.getLockedUntil()).isEqualTo(now.plus(Duration.ofMinutes(30)));
	}

	@Test
	void theWaitStopsGrowingAtTheMaximum() {
		User user = User.invite("ana@example.com", "Ana", Set.of());
		Instant now = this.start;
		for (int lock = 0; lock < 30 && !user.isLockedPermanently(); lock++) {
			fail(user, now, 5);
			if (!user.isLockedPermanently()) {
				assertThat(Duration.between(now, user.getLockedUntil())).isLessThanOrEqualTo(Duration.ofHours(6));
				now = user.getLockedUntil();
			}
		}
	}

	@Test
	void aHundredConsecutiveFailuresLockUntilThePasswordIsReset() {
		User user = User.invite("ana@example.com", "Ana", Set.of());
		Instant now = this.start;
		for (int i = 0; i < 100; i++) {
			user.recordLoginFailure(now, POLICY);
			now = now.plus(Duration.ofHours(1));
		}
		assertThat(user.isLockedPermanently()).isTrue();
		assertThat(user.isLocked(now.plus(Duration.ofDays(365)))).isTrue();
		user.setPassword("{noop}new");
		assertThat(user.isLocked(now)).isFalse();
	}

	@Test
	void aQuietPeriodLongerThanTheResetWindowStartsTheCountOver() {
		User user = User.invite("ana@example.com", "Ana", Set.of());
		fail(user, this.start, 4);
		fail(user, this.start.plus(Duration.ofHours(13)), 1);
		assertThat(user.isLocked(this.start.plus(Duration.ofHours(13)))).isFalse();
	}

	private static void fail(User user, Instant now, int times) {
		for (int i = 0; i < times; i++) {
			user.recordLoginFailure(now, POLICY);
		}
	}

}
