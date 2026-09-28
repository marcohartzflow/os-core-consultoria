package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.domain.Conversation;
import com.maximusflow.os.ai.internal.tools.AuditedToolCallback;
import com.maximusflow.os.ai.internal.tools.ConfirmingToolCallback;
import com.maximusflow.os.ai.internal.tools.ContextPropagatingToolCallback;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.common.ui.UiAction;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One agent turn: the model receives only the tools the current person may execute, destructive
 * tools are replaced by confirmation stubs, every tool call is audited under the conversation id, and
 * the use case's own {@code @RequiresPermission} still runs inside each call.
 */
@Service
public class AgentService {

	public record ToolView(String name, String description, boolean destructive) {
	}

	public record Reply(String text) {
	}

	private final ChatClient chatClient;

	private final ToolRegistry registry;

	private final ConversationService conversations;

	private final PendingActionService pendingActions;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AiProperties properties;

	private final Clock clock;

	AgentService(ChatClient osChatClient, ToolRegistry registry, ConversationService conversations,
			PendingActionService pendingActions, CurrentUser currentUser, AuditRecorder audit, AiProperties properties,
			Clock clock) {
		this.chatClient = osChatClient;
		this.registry = registry;
		this.conversations = conversations;
		this.pendingActions = pendingActions;
		this.currentUser = currentUser;
		this.audit = audit;
		this.properties = properties;
		this.clock = clock;
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public List<ToolView> availableTools() {
		return toolsFor(this.currentUser.require()).stream()
			.map((t) -> new ToolView(t.name(), t.description(), t.destructive())).toList();
	}

	/**
	 * One agent turn. Tokens are handed to {@code onToken} as the model produces them; tool events go
	 * to {@code listener}. Blocks the calling thread until the turn ends, so the caller (a virtual
	 * thread per request) can write SSE frames in order. Tool calls run on Reactor threads with the
	 * turn's security context, audit scope and listener re-established by
	 * {@link ContextPropagatingToolCallback}. No transaction spans the model call: the use cases the
	 * tools invoke open their own.
	 */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public Reply chat(UUID conversationId, String userMessage, @Nullable Consumer<ToolEvents.Event> listener,
			@Nullable Consumer<UiAction> uiListener, Consumer<String> onToken) {
		if (userMessage.isBlank() || userMessage.length() > this.properties.maxUserMessageLength()) {
			throw new DomainRuleException("Mensagem vazia ou longa demais");
		}
		OsPrincipal actor = this.currentUser.require();
		Conversation conversation = this.conversations.requireOwned(conversationId);
		this.conversations.touch(conversation, userMessage);
		String id = conversationId.toString();
		SecurityContext securityContext = SecurityContextHolder.getContext();

		List<ToolCallback> callbacks = toolsFor(actor).stream()
			.map((tool) -> new ContextPropagatingToolCallback(wrap(tool, conversationId), securityContext, id, listener,
					uiListener))
			.map(ToolCallback.class::cast)
			.toList();
		this.audit.record("ai.turn.started", "ai_conversation", id, Map.of("tools", callbacks.size()));

		StringBuilder full = new StringBuilder();
		Iterable<String> tokens = this.chatClient.prompt()
			.user(userMessage)
			.tools(callbacks.toArray(ToolCallback[]::new))
			.toolContext(Map.of("conversationId", id))
			.advisors((a) -> a.param(ChatMemory.CONVERSATION_ID, id))
			.stream()
			.content()
			.toIterable();
		for (String token : tokens) {
			if (token != null && !token.isEmpty()) {
				full.append(token);
				onToken.accept(token);
			}
		}
		return new Reply(full.toString());
	}

	private List<RegisteredTool> toolsFor(OsPrincipal actor) {
		Set<String> permissions = actor.getAuthorities().stream().map(GrantedAuthority::getAuthority)
			.collect(Collectors.toSet());
		return this.registry.forPermissions(permissions);
	}

	private ToolCallback wrap(RegisteredTool tool, UUID conversationId) {
		ToolCallback inner = tool.destructive()
				? new ConfirmingToolCallback(tool, (t, args) -> this.pendingActions.park(conversationId, t, args))
				: tool.callback();
		return new AuditedToolCallback(inner, this.audit, this.clock);
	}

}
