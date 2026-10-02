package com.maximusflow.os;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * A clock the test moves forward: TOTP codes live for one 30-second step, so a test that needs
 * several codes, or a step-up window to pass, advances it instead of waiting.
 */
@TestConfiguration(proxyBeanMethods = false)
public class MovableClock {

	private static volatile Duration offset = Duration.ZERO;

	public static void advance(Duration duration) {
		offset = offset.plus(duration);
	}

	@Bean
	@Primary
	Clock movableClock() {
		return new Clock() {
			@Override
			public ZoneId getZone() {
				return ZoneOffset.UTC;
			}

			@Override
			public Clock withZone(ZoneId zone) {
				return this;
			}

			@Override
			public Instant instant() {
				return Instant.now().plus(offset);
			}
		};
	}

}
