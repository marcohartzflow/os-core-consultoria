package com.maximusflow.os.ai.internal.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.common.error.RateLimitedException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Turns started per person per minute (OWASP LLM10): over the limit is a 429 before any model call,
 * counted per person, and the window slides. The 429 Problem Details mapping of
 * {@link RateLimitedException} is covered end to end by the concurrency test in AiChatStreamTests.
 */
class AiControllerTurnLimitTests {

	@Test
	void aPersonStartsAtMostTheConfiguredTurnsPerMinute() {
		Instant start = Instant.parse("2026-10-02T12:00:00Z");
		Instant[] now = { start };
		Clock clock = new Clock() {
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
				return now[0];
			}
		};
		CurrentUser currentUser = mock(CurrentUser.class);
		OsPrincipal ana = principal("ana@example.com");
		OsPrincipal bia = principal("bia@example.com");
		// Turns are queued, never run: only the admission is under test.
		AsyncTaskExecutor queue = mock(AsyncTaskExecutor.class);
		AiProperties properties = new AiProperties(Duration.ofMinutes(5), 40, Duration.ofMinutes(5), 100, 2, 4000);
		AiController controller = new AiController(mock(AgentService.class), mock(ConversationService.class),
				mock(PendingActionService.class), queue, currentUser, properties, clock);
		UUID conversation = UUID.randomUUID();
		var body = new AiController.MessageRequest("oi");

		when(currentUser.require()).thenReturn(ana);
		assertThat(controller.send(conversation, body, new MockHttpServletRequest())).isNotNull();
		assertThat(controller.send(conversation, body, new MockHttpServletRequest())).isNotNull();
		assertThatExceptionOfType(RateLimitedException.class)
			.isThrownBy(() -> controller.send(conversation, body, new MockHttpServletRequest()));

		when(currentUser.require()).thenReturn(bia);
		assertThat(controller.send(conversation, body, new MockHttpServletRequest())).isNotNull();

		now[0] = start.plusSeconds(61);
		when(currentUser.require()).thenReturn(ana);
		assertThat(controller.send(conversation, body, new MockHttpServletRequest())).isNotNull();
	}

	private static OsPrincipal principal(String email) {
		return new OsPrincipal(UUID.randomUUID(), email, email, null, true, true, Set.of("ai.chat.use"));
	}

}
