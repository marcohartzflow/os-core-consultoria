package com.maximusflow.os.iam.internal.application;

import java.util.Map;
import java.util.Set;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.iam.PermissionCatalog;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.RoleRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * On every start: makes sure the system administrator role exists and holds every permission in the
 * catalog (new modules add permissions; administrators get them automatically).
 *
 * <p>On first start (no users): creates the first administrator from {@code os.iam.bootstrap.*}.
 */
@Component
class Bootstrap implements ApplicationRunner {

	static final String ADMIN_ROLE = "Administrador";

	private static final Logger log = LoggerFactory.getLogger(Bootstrap.class);

	private final RoleRepository roles;

	private final UserRepository users;

	private final PermissionCatalog catalog;

	private final PasswordPolicy passwordPolicy;

	private final IamProperties properties;

	private final AuditRecorder audit;

	Bootstrap(RoleRepository roles, UserRepository users, PermissionCatalog catalog, PasswordPolicy passwordPolicy,
			IamProperties properties, AuditRecorder audit) {
		this.roles = roles;
		this.users = users;
		this.catalog = catalog;
		this.passwordPolicy = passwordPolicy;
		this.properties = properties;
		this.audit = audit;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		Role admin = this.roles.findFirstBySystemTrue().orElseGet(() -> {
			Role created = this.roles
				.save(Role.system(ADMIN_ROLE, "Acesso total. Criada pelo sistema.", this.catalog.keys()));
			this.audit.recordSystem("iam.role.created", "role", created.getId().toString(),
					Map.of("name", ADMIN_ROLE, "system", true));
			return created;
		});
		admin.grantAll(this.catalog.keys());

		if (this.users.count() > 0) {
			return;
		}
		var bootstrap = this.properties.bootstrap();
		String email = bootstrap.adminEmail();
		String password = bootstrap.adminPassword();
		if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
			log.error("No users exist and os.iam.bootstrap.admin-email / admin-password are not set. "
					+ "Nobody can log in until they are configured and the application restarts.");
			return;
		}
		String hash;
		try {
			hash = this.passwordPolicy.validateAndHash(password);
		}
		catch (RuntimeException ex) {
			log.error("Bootstrap password rejected, first administrator not created: {}", ex.getMessage());
			return;
		}
		User user = this.users.save(User.bootstrap(email, bootstrap.adminName(), hash, Set.of(admin),
				bootstrap.requirePasswordChange()));
		this.audit.recordSystem("iam.user.bootstrapped", "user", user.getId().toString(),
				Map.of("email", user.getEmail()));
		log.warn("First administrator created: {}. Change the bootstrap password after the first login.",
				user.getEmail());
	}

}
