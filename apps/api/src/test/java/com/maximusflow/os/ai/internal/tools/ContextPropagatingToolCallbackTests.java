package com.maximusflow.os.ai.internal.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.ui.UiAction;
import com.maximusflow.os.common.ui.UiActions;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Streaming runs tools on other threads; the turn's context must be there anyway. */
class ContextPropagatingToolCallbackTests {

	@Test
	void reestablishesSecurityAuditAndListenerOnAnotherThread() throws Exception {
		OsPrincipal principal = new OsPrincipal(UUID.randomUUID(), "ana@example.com", "Ana", null, true, true,
				java.util.Set.of("tasks.task.read"));
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		RecordingTurn turn = new RecordingTurn();

		ToolCallback delegate = new ToolCallback() {
			@Override
			public ToolDefinition getToolDefinition() {
				return ToolDefinition.builder().name("probe").description("probe").inputSchema("{}").build();
			}

			@Override
			public String call(String input) {
				return call(input, null);
			}

			@Override
			public String call(String input, ToolContext toolContext) {
				ToolEvents.publish(new ToolEvents.ToolCalled("probe"));
				UiActions.publish(new UiAction.Navigate("/tasks", "Ver tarefas"));
				var auth = SecurityContextHolder.getContext().getAuthentication();
				return ((OsPrincipal) auth.getPrincipal()).getEmail() + "|"
						+ AuditContext.current().map(AuditContext.Scope::origin).orElse(null) + "|"
						+ AuditContext.current().map(AuditContext.Scope::correlationId).orElse(null);
			}
		};
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> context, "conv-1", turn);

		try (var executor = Executors.newSingleThreadExecutor()) {
			String result = CompletableFuture.supplyAsync(() -> wrapped.call("{}", null), executor).get();
			assertThat(result).isEqualTo("ana@example.com|" + AuditOrigin.AI_TOOL + "|conv-1");
			// Nothing leaks into the worker thread after the call.
			Boolean clean = CompletableFuture.supplyAsync(
					() -> SecurityContextHolder.getContext().getAuthentication() == null && AuditContext.current().isEmpty(),
					executor).get();
			assertThat(clean).isTrue();
		}
		assertThat(turn.events).containsExactly(new ToolEvents.ToolCalled("probe"));
		assertThat(turn.ui).containsExactly(new UiAction.Navigate("/tasks", "Ver tarefas"));
		// Every event of one call carries the same call id.
		assertThat(turn.callIds).hasSize(1);
	}

	@Test
	void eachCallSeesTheActorAsTheyAreNowSoRevocationAppliesMidTurn() {
		List<SecurityContext> contexts = new ArrayList<>(List.of(contextWith(Set.of("tasks.task.read")),
				SecurityContextHolder.createEmptyContext()));
		ToolCallback delegate = probe(() -> {
			var auth = SecurityContextHolder.getContext().getAuthentication();
			return (auth == null) ? "anonymous" : String.join(",", auth.getAuthorities().stream()
				.map(org.springframework.security.core.GrantedAuthority::getAuthority).sorted().toList());
		});
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contexts.removeFirst(), "conv-1", null);

		assertThat(wrapped.call("{}", null)).isEqualTo("tasks.task.read");
		// The account was disabled between two tool calls of the same turn.
		assertThat(wrapped.call("{}", null)).isEqualTo("anonymous");
	}

	/** The request that started the turn: its client address for the audit rows, its MDC for the log lines. */
	@Test
	void carriesTheRequestsAddressAndLogContextToTheModelsThread() throws Exception {
		ToolCallback delegate = probe(() -> AuditContext.current().map(AuditContext.Scope::ip).orElse(null) + "|"
				+ org.slf4j.MDC.get("http.request.id"));
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contextWith(Set.of("x")), "conv-1", null,
				"203.0.113.7", java.util.Map.of("http.request.id", "req-1"));

		try (var executor = Executors.newSingleThreadExecutor()) {
			assertThat(CompletableFuture.supplyAsync(() -> wrapped.call("{}", null), executor).get())
				.isEqualTo("203.0.113.7|req-1");
			assertThat(CompletableFuture.supplyAsync(() -> org.slf4j.MDC.getCopyOfContextMap(), executor).get())
				.isNullOrEmpty();
		}
	}

	@Test
	void aFailingToolLeavesNothingBehindOnTheThread() {
		ToolCallback delegate = probe(() -> {
			throw new IllegalStateException("boom");
		});
		RecordingTurn turn = new RecordingTurn();
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contextWith(Set.of("x")), "conv-1", turn);

		assertThatThrownBy(() -> wrapped.call("{}", null)).isInstanceOf(IllegalStateException.class);
		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		assertThat(AuditContext.current()).isEmpty();
		ToolEvents.publish(new ToolEvents.ToolCalled("after"));
		assertThat(turn.events).isEmpty();
	}

	/** After the person stopped the turn (or left), no tool runs, not even one they allowed. */
	@Test
	void aStoppedTurnRunsNoFurtherTool() {
		List<String> ran = new ArrayList<>();
		ToolCallback delegate = probe(() -> {
			ran.add("ran");
			return "ok";
		});
		RecordingTurn turn = new RecordingTurn();
		turn.open = false;
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contextWith(Set.of("x")), "conv-1", turn);

		assertThatThrownBy(() -> wrapped.call("{}", null)).isInstanceOf(TurnCancelledException.class);
		assertThat(ran).isEmpty();
	}

	private static final class RecordingTurn implements TurnListener {

		final List<ToolEvents.Event> events = new ArrayList<>();

		final Set<UUID> callIds = new java.util.HashSet<>();

		final List<UiAction> ui = new ArrayList<>();

		boolean open = true;

		@Override
		public boolean isOpen() {
			return this.open;
		}

		@Override
		public void token(String text) {
		}

		@Override
		public void thinking() {
		}

		@Override
		public void tool(UUID callId, ToolEvents.Event event) {
			this.callIds.add(callId);
			this.events.add(event);
		}

		@Override
		public void ui(UiAction action) {
			this.ui.add(action);
		}

	}

	private static SecurityContext contextWith(Set<String> permissions) {
		OsPrincipal principal = new OsPrincipal(UUID.randomUUID(), "ana@example.com", "Ana", null, true, true,
				permissions);
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		return context;
	}

	private static ToolCallback probe(java.util.function.Supplier<String> body) {
		return new ToolCallback() {
			@Override
			public ToolDefinition getToolDefinition() {
				return ToolDefinition.builder().name("probe").description("probe").inputSchema("{}").build();
			}

			@Override
			public String call(String input) {
				return body.get();
			}

			@Override
			public String call(String input, ToolContext toolContext) {
				return body.get();
			}
		};
	}

}
