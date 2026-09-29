package com.maximusflow.os.iam.internal.application;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.logging.Sanitize;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.RoleRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Rules around the system administrator role, the only role that holds reserved permissions.
 *
 * <ul>
 * <li>At least {@code os.iam.administrators.minimum} active administrators remain: removing the role
 * from one or disabling one below that number is refused.</li>
 * <li>Granting the role needs the granting person's current password, so a hijacked session alone
 * cannot create a new administrator.</li>
 * <li>Every active administrator is told when someone becomes one, after the change commits.</li>
 * </ul>
 */
@Component
class AdministratorPolicy {

	/** Published when an account receives the system role. Ids only: events are archived. */
	record AdministratorGranted(UUID userId, UUID grantedBy) {
	}

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final UserRepository users;

	private final RoleRepository roles;

	private final PasswordPolicy passwordPolicy;

	private final CurrentUser currentUser;

	private final AccountNotifier notifier;

	private final AuditRecorder audit;

	private final ApplicationEventPublisher events;

	private final int minimum;

	AdministratorPolicy(UserRepository users, RoleRepository roles, PasswordPolicy passwordPolicy,
			CurrentUser currentUser, AccountNotifier notifier, AuditRecorder audit, ApplicationEventPublisher events,
			IamProperties properties) {
		this.users = users;
		this.roles = roles;
		this.passwordPolicy = passwordPolicy;
		this.currentUser = currentUser;
		this.notifier = notifier;
		this.audit = audit;
		this.events = events;
		this.minimum = Math.max(1, properties.administrators().minimum());
	}

	AdministratorStatus status() {
		return AdministratorStatus.of(activeAdministrators(), this.minimum);
	}

	/** Called before the user loses the system role or stops being active. */
	void assertCanStopBeingAdministrator(User user) {
		Role system = systemRole();
		boolean counts = user.getStatus() == AccountStatus.ACTIVE && user.getRoles().contains(system);
		if (counts && activeAdministrators() - 1 < this.minimum) {
			throw new DomainRuleException("O portal precisa manter pelo menos " + this.minimum
					+ " administrador(es) ativo(s). Promova outra pessoa antes de remover esta.");
		}
	}

	/**
	 * Called before roles are granted. When they include the system role, the acting person confirms
	 * with their current password.
	 */
	void confirmGrant(Set<Role> added, @Nullable String currentPassword) {
		if (added.stream().noneMatch(Role::isSystem)) {
			return;
		}
		OsPrincipal actor = this.currentUser.require();
		String hash = this.users.findById(actor.getId()).map(User::getPasswordHash).orElse(null);
		if (currentPassword == null || currentPassword.isEmpty() || hash == null
				|| !this.passwordPolicy.matches(currentPassword, hash)) {
			security.warn("administrator grant without valid password confirmation user={}",
					Sanitize.forLog(actor.getEmail()));
			throw new DomainRuleException("Confirme com a sua senha para conceder acesso de administrador");
		}
	}

	/** Called after the system role was granted; notification happens after commit. */
	void granted(User user) {
		UUID actor = this.currentUser.require().getId();
		security.warn("administrator role granted user={} by={}", user.getId(), actor);
		this.events.publishEvent(new AdministratorGranted(user.getId(), actor));
	}

	@ApplicationModuleListener
	void on(AdministratorGranted event) {
		User grantee = this.users.findById(event.userId()).orElse(null);
		if (grantee == null) {
			return;
		}
		String grantedBy = this.users.findById(event.grantedBy()).map(User::getName).orElse("—");
		Role system = systemRole();
		int notified = 0;
		for (User admin : this.users.findAllByStatusAndRolesContaining(AccountStatus.ACTIVE, system)) {
			if (!admin.getId().equals(grantee.getId())) {
				this.notifier.sendAdministratorGranted(admin.getEmail(), admin.getName(), grantee.getName(),
						grantee.getEmail(), grantedBy);
				notified++;
			}
		}
		this.audit.recordSystem("iam.administrator.announced", "user", grantee.getId().toString(),
				Map.of("notified", notified));
	}

	private long activeAdministrators() {
		return this.users.countByStatusAndRolesContaining(AccountStatus.ACTIVE, systemRole());
	}

	private Role systemRole() {
		return this.roles.findFirstBySystemTrue().orElseThrow();
	}

}
