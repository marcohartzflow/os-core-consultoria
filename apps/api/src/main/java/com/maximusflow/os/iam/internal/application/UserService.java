package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.ConflictException;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.privacy.PersonalDataService;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.Destructive;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.common.ui.UiAction;
import com.maximusflow.os.common.ui.UiActions;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDisabled;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.RoleRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class UserService {

	/** Reserved: only the system administrator decides who accesses what. */
	public static final String ASSIGN_ROLES = "iam.user.roles.assign";

	/** Bounds the listing, on REST and for the model. */
	public static final int MAX_LIST = 200;

	/** {@code invitationLink} is present only while no e-mail delivery is configured. */
	public record InvitationIssued(UserSummary user, @Nullable String invitationLink) {
	}

	private final UserRepository users;

	private final RoleRepository roles;

	private final AccountTokens tokens;

	private final AccountNotifier notifier;

	private final AppLinks links;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final CurrentUser currentUser;

	private final GrantGuard grantGuard;

	private final ApplicationEventPublisher events;

	private final PersonalDataService personalData;

	private final AdministratorPolicy administrators;

	private final Clock clock;

	UserService(UserRepository users, RoleRepository roles, AccountTokens tokens, AccountNotifier notifier,
			AppLinks links, IamProperties properties, AuditRecorder audit, CurrentUser currentUser,
			GrantGuard grantGuard, ApplicationEventPublisher events, PersonalDataService personalData,
			AdministratorPolicy administrators, Clock clock) {
		this.administrators = administrators;
		this.users = users;
		this.roles = roles;
		this.tokens = tokens;
		this.notifier = notifier;
		this.links = links;
		this.properties = properties;
		this.audit = audit;
		this.currentUser = currentUser;
		this.grantGuard = grantGuard;
		this.events = events;
		this.personalData = personalData;
		this.clock = clock;
	}

	@Tool(name = "iam_list_users",
			description = "Lista os usuários do portal (até " + MAX_LIST + "): id, nome, e-mail, status (INVITED, ACTIVE, DISABLED), se está bloqueado, roles e último acesso.")
	@RequiresPermission(value = "iam.user.read", description = "Ver usuários")
	@Transactional(readOnly = true)
	public List<UserSummary> list() {
		return this.users.findAllByOrderByNameAsc(Limit.of(MAX_LIST)).stream()
			.map((u) -> UserSummary.of(u, this.clock.instant()))
			.toList();
	}

	@Tool(name = "iam_get_user", description = "Detalha um usuário do portal pelo id.")
	@RequiresPermission(value = "iam.user.read", description = "Ver usuários")
	@Transactional(readOnly = true)
	public UserSummary get(@ToolParam(description = "Id (UUID) do usuário") UUID id) {
		User user = load(id);
		UiActions.publish(new UiAction.Navigate("/settings/users/" + user.getId(), "Abrir " + user.getName()));
		return UserSummary.of(user, this.clock.instant());
	}

	/**
	 * Invites a person. Inviting is delegable; giving the new account roles is not: {@code roleIds}
	 * must be empty unless the caller holds {@value #ASSIGN_ROLES}, and granting the system role
	 * needs the caller's current password.
	 */
	@RequiresPermission(value = "iam.user.create", description = "Convidar usuários")
	public InvitationIssued invite(String email, String name, Set<UUID> roleIds, @Nullable String currentPassword) {
		String normalized = User.normalizeEmail(email);
		if (this.users.existsByEmail(normalized)) {
			throw new ConflictException("Já existe um usuário com este e-mail");
		}
		Set<Role> granted = resolveRoles(roleIds);
		if (!granted.isEmpty()) {
			assertMayAssignRoles();
			this.grantGuard.assertCanGrantRoles(granted);
			this.administrators.confirmGrant(granted, currentPassword);
		}
		User user = this.users.save(User.invite(normalized, name, granted));
		if (granted.stream().anyMatch(Role::isSystem)) {
			this.administrators.granted(user);
		}
		String link = issueInvitation(user);
		this.audit.record("iam.user.invited", "user", user.getId().toString(),
				Map.of("email", user.getEmail(), "roles", roleNames(user)));
		return new InvitationIssued(UserSummary.of(user, this.clock.instant()), link);
	}

	@RequiresPermission(value = "iam.user.create", description = "Convidar usuários")
	public InvitationIssued resendInvitation(UUID id) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		if (user.getStatus() != AccountStatus.INVITED) {
			throw new DomainRuleException("Só é possível reenviar convite para usuário ainda não ativado");
		}
		String link = issueInvitation(user);
		this.audit.record("iam.user.invitation_resent", "user", user.getId().toString(), null);
		return new InvitationIssued(UserSummary.of(user, this.clock.instant()), link);
	}

	@RequiresPermission(value = "iam.user.update", description = "Editar o nome de usuários")
	public UserSummary rename(UUID id, String name) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		String before = user.getName();
		user.rename(name);
		this.audit.record("iam.user.renamed", "user", user.getId().toString(),
				Map.of("nameBefore", before, "nameAfter", user.getName()));
		return UserSummary.of(user, this.clock.instant());
	}

	/**
	 * Replaces the user's roles. Reserved to the system administrator: deciding who accesses what is
	 * never delegated. {@code currentPassword} is required when the system role is being granted.
	 */
	@RequiresPermission(value = ASSIGN_ROLES, description = "Atribuir roles a usuários", reserved = true)
	public UserSummary assignRoles(UUID id, Set<UUID> roleIds, @Nullable String currentPassword) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		Set<Role> before = new HashSet<>(user.getRoles());
		Set<Role> after = resolveRoles(roleIds);
		Set<Role> added = after.stream().filter((r) -> !before.contains(r)).collect(Collectors.toSet());
		this.grantGuard.assertCanGrantRoles(added);
		if (before.stream().anyMatch(Role::isSystem) && after.stream().noneMatch(Role::isSystem)) {
			this.administrators.assertCanStopBeingAdministrator(user);
		}
		this.administrators.confirmGrant(added, currentPassword);
		user.replaceRoles(after);
		this.audit.record("iam.user.roles_assigned", "user", user.getId().toString(),
				Map.of("rolesBefore", names(before), "rolesAfter", names(after)));
		if (added.stream().anyMatch(Role::isSystem)) {
			this.administrators.granted(user);
		}
		return UserSummary.of(user, this.clock.instant());
	}

	@RequiresPermission(value = "iam.user.read", description = "Ver usuários")
	@Transactional(readOnly = true)
	public AdministratorStatus administrators() {
		return this.administrators.status();
	}

	@Tool(name = "iam_disable_user",
			description = "Desativa um usuário: ele perde o acesso ao portal imediatamente e suas sessões são encerradas. Exige confirmação da pessoa.")
	@Destructive("Desativa o usuário e encerra todas as sessões dele")
	@RequiresPermission(value = "iam.user.disable", description = "Desativar e reativar usuários")
	public UserSummary disable(@ToolParam(description = "Id (UUID) do usuário") UUID id) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		if (user.getId().equals(this.currentUser.require().getId())) {
			throw new DomainRuleException("Você não pode desativar a própria conta");
		}
		this.administrators.assertCanStopBeingAdministrator(user);
		user.disable();
		this.events.publishEvent(new UserDisabled(user.getId()));
		this.audit.record("iam.user.disabled", "user", user.getId().toString(), null);
		return UserSummary.of(user, this.clock.instant());
	}

	@RequiresPermission(value = "iam.user.disable", description = "Desativar e reativar usuários")
	public UserSummary enable(UUID id) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		if (user.isAnonymized()) {
			throw new DomainRuleException("Uma conta anonimizada não pode ser reativada");
		}
		user.enable();
		this.audit.record("iam.user.enabled", "user", user.getId().toString(), null);
		return UserSummary.of(user, this.clock.instant());
	}

	/** Irreversible erasure (LGPD). Reserved, and never an AI tool: only a person in the portal does it. */
	@RequiresPermission(value = "iam.user.anonymize", description = "Anonimizar dados pessoais de usuários desativados",
			reserved = true)
	public UserSummary anonymize(UUID id) {
		User user = load(id);
		this.grantGuard.assertCanManage(user);
		if (user.getId().equals(this.currentUser.require().getId())) {
			throw new DomainRuleException("Você não pode anonimizar a própria conta por aqui");
		}
		if (user.getStatus() != AccountStatus.DISABLED) {
			throw new DomainRuleException("Desative o usuário antes de anonimizar os dados");
		}
		if (user.isAnonymized()) {
			throw new DomainRuleException("Os dados deste usuário já foram anonimizados");
		}
		this.personalData.erase(user.getId(), user.getEmail());
		this.audit.record("iam.user.anonymized", "user", user.getId().toString(), null);
		return UserSummary.of(user, this.clock.instant());
	}

	private void assertMayAssignRoles() {
		boolean allowed = this.currentUser.require().getAuthorities().stream()
			.anyMatch((a) -> ASSIGN_ROLES.equals(a.getAuthority()));
		if (!allowed) {
			throw new AccessDeniedException("Assigning roles is reserved to the system administrator");
		}
	}

	private @Nullable String issueInvitation(User user) {
		String raw = this.tokens.issue(user, TokenType.INVITATION, this.properties.tokens().invitationTtl());
		String link = this.links.invitation(raw);
		this.notifier.sendInvitation(user.getEmail(), user.getName(), link);
		return this.notifier.handsLinksToAdministrator() ? link : null;
	}

	private User load(UUID id) {
		return this.users.findWithRolesById(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

	private Set<Role> resolveRoles(@Nullable Set<UUID> roleIds) {
		if (roleIds == null || roleIds.isEmpty()) {
			return Set.of();
		}
		List<Role> found = this.roles.findAllById(roleIds);
		if (found.size() != roleIds.size()) {
			throw new DomainRuleException("Uma ou mais roles informadas não existem");
		}
		return new HashSet<>(found);
	}

	private static Set<String> roleNames(User user) {
		return names(user.getRoles());
	}

	private static Set<String> names(Set<Role> roles) {
		return roles.stream().map(Role::getName).collect(Collectors.toSet());
	}

}
