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
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolEvents;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresPermission;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.security.core.GrantedAuthority;
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

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional
	public Reply chat(UUID conversationId, String userMessage, @Nullable Consumer<ToolEvents.Event> listener) {
		if (userMessage.isBlank() || userMessage.length() > this.properties.maxUserMessageLength()) {
			throw new DomainRuleException("Mensagem vazia ou longa demais");
		}
		OsPrincipal actor = this.currentUser.require();
		Conversation conversation = this.conversations.requireOwned(conversationId);
		this.conversations.touch(conversation, userMessage);
		String id = conversationId.toString();

		List<ToolCallback> callbacks = toolsFor(actor).stream().map((tool) -> wrap(tool, conversationId)).toList();
		this.audit.record("ai.turn.started", "ai_conversation", id, Map.of("tools", callbacks.size()));

		String text = AuditContext.with(AuditOrigin.AI_TOOL, id,
				() -> ToolEvents.listen(listener, () -> this.chatClient.prompt()
					.user(userMessage)
					.toolCallbacks(callbacks.toArray(ToolCallback[]::new))
					.toolContext(Map.of("conversationId", id))
					.advisors((a) -> a.param(ChatMemory.CONVERSATION_ID, id))
					.call()
					.content()));
		return new Reply((text != null) ? text : "");
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
