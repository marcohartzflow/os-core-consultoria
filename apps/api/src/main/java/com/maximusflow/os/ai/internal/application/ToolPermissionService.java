package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.ai.internal.AiProperties;
import com.maximusflow.os.ai.internal.domain.ToolGrant;
import com.maximusflow.os.ai.internal.persistence.ToolGrantRepository;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolArguments;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.RequiresConfirmation.Risk;
import com.maximusflow.os.common.security.RequiresPermission;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What each person lets the assistant do with each tool, as in Claude's tool permissions: every tool
 * can run without asking, ask first, or be blocked. Tightening is always possible (asking before a
 * read, blocking anything); loosening has a ceiling: an action runs without asking only as far as its
 * {@link Risk} and the company policy ({@code os.ai.allow-always}) allow. Choices only ever restrict
 * what the person's own permissions allow, and the ceilings are checked on every use, not only when
 * the choice is saved: a grant left behind by an older rule simply stops working.
 */
@Service
public class ToolPermissionService {

	/** What happens when the agent calls the tool. */
	public enum Choice {

		/** Runs without asking. */
		ALLOW,
		/** Shows the approval card first (the default for actions; a choice for reads). */
		ASK,
		/** The agent does not get the tool. */
		BLOCK

	}

	/** How far a decision on a confirmation card reaches. */
	public enum Scope {

		ONCE, CONVERSATION, ALWAYS

	}

	/**
	 * One row of the assistant's Tools settings. {@code choices}: what the person may pick for it;
	 * {@code expiresAt}: when "always" ends; {@code allowAlwaysOff}: the company turned "always" off.
	 */
	public record ToolSetting(String name, String description, boolean action, Risk risk, Choice choice,
			List<Choice> choices, @Nullable Instant expiresAt, @Nullable Instant lastUsedAt, boolean allowAlwaysOff) {
	}

	private final ToolGrantRepository grants;

	private final ToolRegistry registry;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final AiProperties properties;

	private final Clock clock;

	ToolPermissionService(ToolGrantRepository grants, ToolRegistry registry, CurrentUser currentUser,
			AuditRecorder audit, AiProperties properties, Clock clock) {
		this.grants = grants;
		this.registry = registry;
		this.currentUser = currentUser;
		this.audit = audit;
		this.properties = properties;
		this.clock = clock;
	}

	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional(readOnly = true)
	public List<ToolSetting> mine() {
		OsPrincipal me = this.currentUser.require();
		Map<String, ToolGrant> saved = this.grants.findByUserIdAndConversationIdIsNull(me.getId()).stream()
			.collect(Collectors.toMap(ToolGrant::getToolName, (g) -> g));
		Instant now = this.clock.instant();
		return toolsOf(me).stream()
			.sorted(Comparator.comparing(RegisteredTool::name))
			.map((tool) -> setting(tool, saved.get(tool.name()), now))
			.toList();
	}

	/** Saves the person's choice for a tool they may use; a choice above the tool's ceiling is refused. */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional
	public ToolSetting choose(String toolName, Choice choice) {
		OsPrincipal me = this.currentUser.require();
		RegisteredTool tool = toolsOf(me).stream()
			.filter((t) -> t.name().equals(toolName))
			.findFirst()
			.orElseThrow(() -> new NotFoundException("Ferramenta não encontrada"));
		Instant now = this.clock.instant();
		if (!choices(tool).contains(choice)) {
			throw new DomainRuleException("Essa opção não vale para esta ferramenta");
		}
		ToolGrant grant = this.grants.findByUserIdAndToolNameAndConversationIdIsNull(me.getId(), toolName)
			.orElse(null);
		if (choice == defaultChoice(tool)) {
			if (grant != null) {
				this.grants.delete(grant);
			}
			grant = null;
		}
		else {
			ToolGrant.Mode mode = switch (choice) {
				case ALLOW -> ToolGrant.Mode.ALLOW;
				case ASK -> ToolGrant.Mode.ASK;
				case BLOCK -> ToolGrant.Mode.BLOCK;
			};
			// Only "run an action without asking" expires; asking or blocking holds until changed.
			Instant expires = (mode == ToolGrant.Mode.ALLOW) ? now.plus(this.properties.allowAlwaysFor()) : null;
			if (grant == null) {
				grant = this.grants.save(new ToolGrant(me.getId(), toolName, mode, null, expires, now));
			}
			else {
				grant.renew(mode, expires, now);
			}
		}
		this.audit.record("ai.tool.preference.changed", "ai_tool", toolName, Map.of("choice", choice.name()));
		return setting(tool, grant, now);
	}

	/** Back to the defaults: every read runs, every action asks. Conversation grants stay with their conversations. */
	@RequiresPermission(value = "ai.chat.use", description = "Usar o assistente de IA")
	@Transactional
	public void reset() {
		OsPrincipal me = this.currentUser.require();
		List<ToolGrant> mine = this.grants.findByUserIdAndConversationIdIsNull(me.getId());
		this.grants.deleteAll(mine);
		this.audit.record("ai.tool.preference.reset", "ai_tool", null, Map.of("count", mine.size()));
	}

	/** Reads the person wants to approve first: the agent gets them behind the approval card. */
	@Transactional(readOnly = true)
	public Set<String> askFirst(UUID userId) {
		return this.grants.findByUserIdAndConversationIdIsNull(userId).stream()
			.filter((g) -> g.getMode() == ToolGrant.Mode.ASK)
			.map(ToolGrant::getToolName)
			.collect(Collectors.toSet());
	}

	/** Tools the person blocked: the agent is not offered them. */
	@Transactional(readOnly = true)
	public Set<String> blocked(UUID userId) {
		return this.grants.findByUserIdAndConversationIdIsNull(userId).stream()
			.filter((g) -> g.getMode() == ToolGrant.Mode.BLOCK)
			.map(ToolGrant::getToolName)
			.collect(Collectors.toSet());
	}

	/**
	 * Whether the action may run without asking now, and why: a grant for this conversation, or the
	 * person's "always". Null when it must ask. Marks the grant used.
	 */
	@Transactional
	public @Nullable Scope autoAllowed(UUID userId, RegisteredTool tool, UUID conversationId, String arguments) {
		Instant now = this.clock.instant();
		ToolGrant forConversation = this.grants
			.findByUserIdAndToolNameAndConversationId(userId, tool.name(), conversationId)
			.filter((g) -> g.getMode() == ToolGrant.Mode.ALLOW && g.isActive(now))
			.orElse(null);
		if (forConversation != null && forConversation.isSingleUse()) {
			// The approval of one call (a read the person approved): that exact call, once.
			if (!forConversation.letsThrough(ToolArguments.sha256(arguments))) {
				return null;
			}
			this.grants.delete(forConversation);
			return Scope.ONCE;
		}
		if (forConversation != null && allows(tool, Scope.CONVERSATION)) {
			forConversation.used(now);
			return Scope.CONVERSATION;
		}
		if (allows(tool, Scope.ALWAYS)) {
			ToolGrant always = this.grants.findByUserIdAndToolNameAndConversationIdIsNull(userId, tool.name())
				.filter((g) -> g.getMode() == ToolGrant.Mode.ALLOW && g.isActive(now))
				.orElse(null);
			if (always != null) {
				always.used(now);
				return Scope.ALWAYS;
			}
		}
		return null;
	}

	/**
	 * The reach of a confirmation ("Permitir nesta conversa", "Permitir sempre"), within the action's
	 * ceiling. Called with the confirmation, by the person who confirmed.
	 */
	@Transactional
	public void grant(UUID userId, RegisteredTool tool, UUID conversationId, Scope scope, String arguments) {
		if (!allows(tool, scope)) {
			throw new DomainRuleException("Essa permissão não vale para esta ação");
		}
		Instant now = this.clock.instant();
		if (!tool.requiresConfirmation()) {
			grantRead(userId, tool, conversationId, scope, arguments, now);
			return;
		}
		if (scope == Scope.ONCE) {
			// The action already ran with the confirmation itself.
			return;
		}
		if (scope == Scope.CONVERSATION) {
			ToolGrant grant = this.grants.findByUserIdAndToolNameAndConversationId(userId, tool.name(), conversationId)
				.orElse(null);
			if (grant == null) {
				this.grants.save(new ToolGrant(userId, tool.name(), ToolGrant.Mode.ALLOW, conversationId, null, now));
			}
			else {
				grant.renew(ToolGrant.Mode.ALLOW, null, now);
			}
		}
		else {
			Instant expires = now.plus(this.properties.allowAlwaysFor());
			ToolGrant grant = this.grants.findByUserIdAndToolNameAndConversationIdIsNull(userId, tool.name())
				.orElse(null);
			if (grant == null) {
				this.grants.save(new ToolGrant(userId, tool.name(), ToolGrant.Mode.ALLOW, null, expires, now));
			}
			else {
				grant.renew(ToolGrant.Mode.ALLOW, expires, now);
			}
		}
		this.audit.record("ai.tool.preference.changed", "ai_tool", tool.name(),
				Map.of("choice", Choice.ALLOW.name(), "scope", scope.name(), "conversationId", conversationId.toString()));
	}

	/**
	 * A read the person asked to approve: approving it once lets the assistant's next call through
	 * (it makes the call again and gets the data); for the conversation, every call there; always, back
	 * to the default of reading without asking.
	 */
	private void grantRead(UUID userId, RegisteredTool tool, UUID conversationId, Scope scope, String arguments,
			Instant now) {
		switch (scope) {
			case ONCE -> {
				// One row per tool and conversation: an earlier approval (used or not) gives way to this one.
				String sha = ToolArguments.sha256(arguments);
				Instant expires = now.plus(this.properties.pendingActionTtl());
				this.grants.findByUserIdAndToolNameAndConversationId(userId, tool.name(), conversationId)
					.ifPresentOrElse((grant) -> grant.renewSingleUse(sha, expires, now),
							() -> this.grants
								.save(ToolGrant.singleUse(userId, tool.name(), conversationId, sha, expires, now)));
			}
			case CONVERSATION -> {
				ToolGrant grant = this.grants.findByUserIdAndToolNameAndConversationId(userId, tool.name(), conversationId)
					.orElse(null);
				if (grant == null) {
					this.grants.save(new ToolGrant(userId, tool.name(), ToolGrant.Mode.ALLOW, conversationId, null, now));
				}
				else {
					grant.renew(ToolGrant.Mode.ALLOW, null, now);
				}
			}
			case ALWAYS -> this.grants.findByUserIdAndToolNameAndConversationIdIsNull(userId, tool.name())
				.filter((g) -> g.getMode() == ToolGrant.Mode.ASK)
				.ifPresent(this.grants::delete);
		}
		this.audit.record("ai.tool.preference.changed", "ai_tool", tool.name(),
				Map.of("choice", Choice.ALLOW.name(), "scope", scope.name(), "conversationId", conversationId.toString()));
	}

	/**
	 * Which reach of "run without asking" the tool allows: any for a read (reading changes nothing);
	 * for an action, its risk and the company policy decide.
	 */
	public boolean allows(RegisteredTool tool, Scope scope) {
		if (!tool.requiresConfirmation()) {
			return true;
		}
		return switch (scope) {
			case ONCE -> true;
			case CONVERSATION -> tool.risk() != Risk.HIGH;
			case ALWAYS -> tool.risk() == Risk.LOW && this.properties.allowAlways();
		};
	}

	/** Asking and blocking are always possible; running without asking, within the ceiling. */
	private List<Choice> choices(RegisteredTool tool) {
		return allows(tool, Scope.ALWAYS) ? List.of(Choice.ALLOW, Choice.ASK, Choice.BLOCK)
				: List.of(Choice.ASK, Choice.BLOCK);
	}

	private static Choice defaultChoice(RegisteredTool tool) {
		return tool.requiresConfirmation() ? Choice.ASK : Choice.ALLOW;
	}

	private ToolSetting setting(RegisteredTool tool, @Nullable ToolGrant grant, Instant now) {
		Choice choice;
		if (grant != null && grant.getMode() == ToolGrant.Mode.BLOCK) {
			choice = Choice.BLOCK;
		}
		else if (grant != null && grant.getMode() == ToolGrant.Mode.ASK) {
			choice = Choice.ASK;
		}
		else if (!tool.requiresConfirmation()) {
			choice = Choice.ALLOW;
		}
		else if (grant != null && grant.isActive(now) && allows(tool, Scope.ALWAYS)) {
			choice = Choice.ALLOW;
		}
		else {
			choice = Choice.ASK;
		}
		boolean allowing = choice == Choice.ALLOW && tool.requiresConfirmation();
		return new ToolSetting(tool.name(), tool.description(), tool.requiresConfirmation(), tool.risk(), choice,
				choices(tool), allowing && grant != null ? grant.getExpiresAt() : null,
				(grant != null) ? grant.getLastUsedAt() : null,
				tool.requiresConfirmation() && tool.risk() == Risk.LOW && !this.properties.allowAlways());
	}

	private List<RegisteredTool> toolsOf(OsPrincipal person) {
		Set<String> permissions = person.getAuthorities().stream().map(GrantedAuthority::getAuthority)
			.collect(Collectors.toSet());
		return this.registry.forPermissions(permissions);
	}

}
