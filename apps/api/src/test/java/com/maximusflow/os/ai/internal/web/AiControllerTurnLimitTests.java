package com.maximusflow.os.ai.internal.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.AiProvider;
import com.maximusflow.os.ai.internal.application.AgentModels;
import com.maximusflow.os.ai.internal.application.AgentService;
import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.application.ToolPermissionService;
import com.maximusflow.os.common.error.ConflictException;
import com.maximusflow.os.common.error.RateLimitedException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

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
		AiProperties.Model model = new AiProperties.Model("claude-opus-5-5", AiProvider.ANTHROPIC, "Claude Opus 5.5",
				"Padrão", "1M");
		AiProperties properties = new AiProperties(Duration.ofMinutes(5), 40, Duration.ofMinutes(5), 100, 2, 4000,
				List.of(model), true, Duration.ofDays(30), 5);
		AgentModels models = new AgentModels(properties.models(), Map.of(AiProvider.ANTHROPIC, mock(ChatClient.class)));
		AiController controller = new AiController(mock(AgentService.class), models, mock(ConversationService.class),
				mock(PendingActionService.class), mock(ToolPermissionService.class), queue, mock(TaskScheduler.class),
				currentUser, properties, clock);
		var body = new AiController.MessageRequest("oi", null);

		// A new conversation each time: queued turns never end, and one conversation runs one turn at a time.
		when(currentUser.require()).thenReturn(ana);
		assertThat(send(controller, UUID.randomUUID(), body)).isNotNull();
		assertThat(send(controller, UUID.randomUUID(), body)).isNotNull();
		assertThatExceptionOfType(RateLimitedException.class).isThrownBy(() -> send(controller, UUID.randomUUID(), body));

		when(currentUser.require()).thenReturn(bia);
		assertThat(send(controller, UUID.randomUUID(), body)).isNotNull();

		now[0] = start.plusSeconds(61);
		when(currentUser.require()).thenReturn(ana);
		assertThat(send(controller, UUID.randomUUID(), body)).isNotNull();
	}

	/** Two turns on one conversation would rewrite each other's memory: the second waits (409). */
	@Test
	void aConversationRunsOneTurnAtATime() {
		CurrentUser currentUser = mock(CurrentUser.class);
		when(currentUser.require()).thenReturn(principal("ana@example.com"));
		AiProperties.Model model = new AiProperties.Model("claude-opus-5-5", AiProvider.ANTHROPIC, "Claude Opus 5.5",
				"Padrão", "1M");
		AiProperties properties = new AiProperties(Duration.ofMinutes(5), 40, Duration.ofMinutes(5), 100, 5, 4000,
				List.of(model), true, Duration.ofDays(30), 5);
		AgentModels models = new AgentModels(properties.models(), Map.of(AiProvider.ANTHROPIC, mock(ChatClient.class)));
		AiController controller = new AiController(mock(AgentService.class), models, mock(ConversationService.class),
				mock(PendingActionService.class), mock(ToolPermissionService.class), mock(AsyncTaskExecutor.class),
				mock(TaskScheduler.class), currentUser, properties, Clock.systemUTC());
		UUID conversation = UUID.randomUUID();
		var body = new AiController.MessageRequest("oi", null);

		assertThat(send(controller, conversation, body)).isNotNull();
		assertThatExceptionOfType(ConflictException.class).isThrownBy(() -> send(controller, conversation, body));
	}

	private static Object send(AiController controller, UUID conversation, AiController.MessageRequest body) {
		return controller.send(conversation, body, new MockHttpServletRequest(), new MockHttpServletResponse());
	}

	private static OsPrincipal principal(String email) {
		return new OsPrincipal(UUID.randomUUID(), email, email, null, true, true, Set.of("ai.chat.use"));
	}

}
