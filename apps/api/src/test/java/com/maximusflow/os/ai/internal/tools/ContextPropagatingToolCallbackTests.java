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
		List<ToolEvents.Event> received = new ArrayList<>();
		List<UiAction> uiActions = new ArrayList<>();

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
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> context, "conv-1", received::add, uiActions::add);

		try (var executor = Executors.newSingleThreadExecutor()) {
			String result = CompletableFuture.supplyAsync(() -> wrapped.call("{}", null), executor).get();
			assertThat(result).isEqualTo("ana@example.com|" + AuditOrigin.AI_TOOL + "|conv-1");
			// Nothing leaks into the worker thread after the call.
			Boolean clean = CompletableFuture.supplyAsync(
					() -> SecurityContextHolder.getContext().getAuthentication() == null && AuditContext.current().isEmpty(),
					executor).get();
			assertThat(clean).isTrue();
		}
		assertThat(received).containsExactly(new ToolEvents.ToolCalled("probe"));
		assertThat(uiActions).containsExactly(new UiAction.Navigate("/tasks", "Ver tarefas"));
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
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contexts.removeFirst(), "conv-1", null, null);

		assertThat(wrapped.call("{}", null)).isEqualTo("tasks.task.read");
		// The account was disabled between two tool calls of the same turn.
		assertThat(wrapped.call("{}", null)).isEqualTo("anonymous");
	}

	@Test
	void aFailingToolLeavesNothingBehindOnTheThread() {
		ToolCallback delegate = probe(() -> {
			throw new IllegalStateException("boom");
		});
		List<ToolEvents.Event> received = new ArrayList<>();
		var wrapped = new ContextPropagatingToolCallback(delegate, () -> contextWith(Set.of("x")), "conv-1",
				received::add, null);

		assertThatThrownBy(() -> wrapped.call("{}", null)).isInstanceOf(IllegalStateException.class);
		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		assertThat(AuditContext.current()).isEmpty();
		ToolEvents.publish(new ToolEvents.ToolCalled("after"));
		assertThat(received).isEmpty();
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
