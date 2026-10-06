package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import static org.assertj.core.api.Assertions.assertThat;

/** The two filters that run before Spring Security reads the session. */
class SessionAndRateFiltersTests {

	@Test
	void aSessionOlderThanTheAbsoluteLimitIsInvalidatedWhateverItsActivity() throws Exception {
		MockHttpSession session = new MockHttpSession();
		Instant created = Instant.ofEpochMilli(session.getCreationTime());

		var withinLimit = new AbsoluteSessionTimeoutFilter(Duration.ofHours(12),
				Clock.fixed(created.plus(Duration.ofHours(11)), ZoneOffset.UTC));
		withinLimit.doFilter(requestWith(session), new MockHttpServletResponse(), new MockFilterChain());
		assertThat(session.isInvalid()).isFalse();

		var pastLimit = new AbsoluteSessionTimeoutFilter(Duration.ofHours(12),
				Clock.fixed(created.plus(Duration.ofHours(12)).plusSeconds(1), ZoneOffset.UTC));
		MockFilterChain chain = new MockFilterChain();
		pastLimit.doFilter(requestWith(session), new MockHttpServletResponse(), chain);
		assertThat(session.isInvalid()).isTrue();
		// The request goes on, unauthenticated; Spring Security answers 401 where needed.
		assertThat(chain.getRequest()).isNotNull();
	}

	@Test
	void loginAttemptsBeyondTheLimitGet429AndNeverReachTheApplication() throws Exception {
		AtomicInteger resolved = new AtomicInteger();
		HandlerExceptionResolver resolver = (request, response, handler, ex) -> {
			resolved.incrementAndGet();
			response.setStatus(429);
			return new ModelAndView();
		};
		var filter = new RateLimitFilter(new AuthProperties.RateLimit(2, 1), Clock.systemUTC(), resolver);

		for (int i = 0; i < 2; i++) {
			MockFilterChain chain = new MockFilterChain();
			MockHttpServletResponse response = new MockHttpServletResponse();
			filter.doFilter(login("10.0.0.7"), response, chain);
			assertThat(chain.getRequest()).isNotNull();
		}
		MockFilterChain blocked = new MockFilterChain();
		MockHttpServletResponse response = new MockHttpServletResponse();
		filter.doFilter(login("10.0.0.7"), response, blocked);
		assertThat(response.getStatus()).isEqualTo(429);
		assertThat(blocked.getRequest()).isNull();
		assertThat(resolved).hasValue(1);

		// Another address and other endpoints are unaffected.
		MockFilterChain other = new MockFilterChain();
		filter.doFilter(login("10.0.0.8"), new MockHttpServletResponse(), other);
		assertThat(other.getRequest()).isNotNull();
		MockFilterChain me = new MockFilterChain();
		MockHttpServletRequest get = new MockHttpServletRequest("GET", "/api/me");
		get.setRemoteAddr("10.0.0.7");
		filter.doFilter(get, new MockHttpServletResponse(), me);
		assertThat(me.getRequest()).isNotNull();
	}

	private static MockHttpServletRequest requestWith(MockHttpSession session) {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/me");
		request.setSession(session);
		return request;
	}

	private static MockHttpServletRequest login(String address) {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
		request.setRemoteAddr(address);
		return request;
	}

}
