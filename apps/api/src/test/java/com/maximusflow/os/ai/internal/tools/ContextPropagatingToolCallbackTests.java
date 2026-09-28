package com.maximusflow.os.ai.internal.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.security.OsPrincipal;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;

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
				var auth = SecurityContextHolder.getContext().getAuthentication();
				return ((OsPrincipal) auth.getPrincipal()).getEmail() + "|"
						+ AuditContext.current().map(AuditContext.Scope::origin).orElse(null) + "|"
						+ AuditContext.current().map(AuditContext.Scope::correlationId).orElse(null);
			}
		};
		var wrapped = new ContextPropagatingToolCallback(delegate, context, "conv-1", received::add);

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
	}

}
