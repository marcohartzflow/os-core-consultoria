package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.domain.PendingAction;
import com.maximusflow.os.ai.internal.persistence.PendingActionRepository;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditContext;
import com.maximusflow.os.common.audit.AuditOrigin;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresPermission;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Human-in-the-loop for destructive tools. */
@Service
public class PendingActionService {

	public record PendingActionView(UUID id, UUID conversationId, String tool, String summary, String arguments,
			PendingAction.Status status, Instant createdAt, Instant expiresAt, @Nullable String result) {
		static PendingActionView of(PendingAction a) {
			return new PendingActionView(a.getId(), a.getConversationId(), a.getToolName(), a.getSummary(),
					a.getArguments(), a.getStatus(), a.getCreatedAt(), a.getExpiresAt(), a.getResult());
		}
	}

	private final PendingActionRepository actions;

	private final ToolRegistry registry;

	private final ChatMemory chatMemory;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AiProperties properties;

	private final TransactionTemplate tx;

	/** Separate transaction so an EXPIRED mark survives the exception that reports it to the caller. */
	private final TransactionTemplate isolated;

	private final Clock clock;

	PendingActionService(PendingActionRepository actions, ToolRegistry registry, ChatMemory chatMemory,
			CurrentUser currentUser, AuditRecorder audit, AiProperties properties,
			PlatformTransactionManager transactionManager, Clock clock) {
		this.actions = actions;
		this.registry = registry;
		this.chatMemory = chatMemory;
		this.currentUser = currentUser;
		this.audit = audit;
		this.properties = properties;
		this.tx = new TransactionTemplate(transactionManager);
		this.isolated = new TransactionTemplate(transactionManager);
		this.isolated.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
		this.clock = clock;
	}

	/**
	 * Called by {@code ConfirmingToolCallback} during an agent turn. Runs in its own transaction so the
	 * pending row exists even if the rest of the turn fails.
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public UUID park(UUID conversationId, RegisteredTool tool, String arguments) {
		OsPrincipal actor = this.currentUser.require();
		Instant now = this.clock.instant();
		PendingAction action = this.actions.save(new PendingAction(conversationId, actor.getId(), tool.name(),
				tool.destructiveSummary().isBlank() ? tool.description() : tool.destructiveSummary(), arguments, now,
				now.plus(this.properties.pendingActionTtl())));
		this.audit.record("ai.action.parked", "ai_action", action.getId().toString(),
				Map.of("tool", tool.name(), "arguments", arguments));
		return action.getId();
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional(readOnly = true)
	public List<PendingActionView> open(UUID conversationId) {
		Instant now = this.clock.instant();
		return this.actions
			.findByConversationIdAndUserIdAndStatusOrderByCreatedAtAsc(conversationId,
					this.currentUser.require().getId(), PendingAction.Status.PENDING)
			.stream().filter((a) -> a.isOpen(now)).map(PendingActionView::of).toList();
	}

	/**
	 * Executes the parked tool as the confirming person. The action is first claimed atomically
	 * (PENDING to EXECUTING), so a second confirmation, concurrent or after a crash, never runs the tool
	 * again. The use case then runs in its own transaction and applies its own authorization and rules;
	 * the outcome is recorded afterwards in a separate transaction so a failed action is still marked
	 * FAILED and audited.
	 */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	public PendingActionView confirm(UUID actionId) {
		PendingAction action = this.tx.execute((status) -> claim(actionId, PendingAction.Status.EXECUTING));
		RegisteredTool tool = this.registry.find(action.getToolName())
			.orElseThrow(() -> new DomainRuleException("Ferramenta não existe mais"));
		String conversationId = action.getConversationId().toString();
		String result;
		try {
			result = AuditContext.with(AuditOrigin.AI_TOOL, conversationId, () -> tool.callback()
				.call(action.getArguments(), new ToolContext(Map.of("conversationId", conversationId))));
		}
		catch (RuntimeException ex) {
			RuntimeException cause = unwrap(ex);
			this.tx.executeWithoutResult((status) -> {
				PendingAction failed = this.actions.findById(actionId).orElseThrow();
				failed.resolve(PendingAction.Status.FAILED, cause.getClass().getSimpleName(), this.clock.instant());
				this.chatMemory.add(conversationId, new SystemMessage("A pessoa confirmou a ação " + tool.name()
						+ " mas a execução falhou: " + cause.getClass().getSimpleName()));
				this.audit.record("ai.action.failed", "ai_action", actionId.toString(),
						Map.of("tool", tool.name(), "reason", cause.getClass().getSimpleName()));
			});
			throw cause;
		}
		return this.tx.execute((status) -> {
			PendingAction done = this.actions.findById(actionId).orElseThrow();
			done.resolve(PendingAction.Status.CONFIRMED, result, this.clock.instant());
			this.chatMemory.add(conversationId, new SystemMessage(
					"A pessoa confirmou a ação " + tool.name() + " e ela foi executada. Resultado: " + result));
			this.audit.record("ai.action.confirmed", "ai_action", actionId.toString(), Map.of("tool", tool.name()));
			return PendingActionView.of(done);
		});
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional
	public PendingActionView reject(UUID actionId) {
		claim(actionId, PendingAction.Status.REJECTED);
		PendingAction action = this.actions.findById(actionId).orElseThrow();
		action.resolve(PendingAction.Status.REJECTED, null, this.clock.instant());
		this.chatMemory.add(action.getConversationId().toString(),
				new SystemMessage("A pessoa recusou a ação " + action.getToolName() + ". Não a execute."));
		this.audit.record("ai.action.rejected", "ai_action", actionId.toString(), Map.of("tool", action.getToolName()));
		return PendingActionView.of(action);
	}

	/** Loads the open action and moves it to {@code to} atomically; exactly one caller wins. */
	private PendingAction claim(UUID actionId, PendingAction.Status to) {
		PendingAction action = loadOpen(actionId);
		int claimed = this.actions.claim(actionId, action.getUserId(), this.clock.instant(),
				PendingAction.Status.PENDING, to);
		if (claimed != 1) {
			throw new DomainRuleException("Esta ação não está mais pendente");
		}
		return action;
	}

	private PendingAction loadOpen(UUID actionId) {
		UUID userId = this.currentUser.require().getId();
		PendingAction action = this.actions.findByIdAndUserId(actionId, userId)
			.orElseThrow(() -> new NotFoundException("Ação não encontrada"));
		Instant now = this.clock.instant();
		if (!action.isOpen(now)) {
			if (action.getStatus() == PendingAction.Status.PENDING) {
				expire(actionId, userId, now);
			}
			throw new DomainRuleException("Esta ação não está mais pendente");
		}
		return action;
	}

	private void expire(UUID actionId, UUID userId, Instant now) {
		this.isolated.executeWithoutResult((status) -> {
			PendingAction expired = this.actions.findByIdAndUserId(actionId, userId).orElseThrow();
			expired.resolve(PendingAction.Status.EXPIRED, null, now);
			this.audit.record("ai.action.expired", "ai_action", actionId.toString(),
					Map.of("tool", expired.getToolName()));
		});
	}

	/** Spring AI wraps use-case exceptions; surface the original so the API maps it (404, 403, 422). */
	private static RuntimeException unwrap(RuntimeException ex) {
		if (ex instanceof ToolExecutionException wrapped && wrapped.getCause() instanceof RuntimeException cause) {
			return cause;
		}
		return ex;
	}

}
