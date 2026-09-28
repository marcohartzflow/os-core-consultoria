package com.maximusflow.os.iam.internal.application;

import java.util.Set;
import java.util.stream.Collectors;

import com.maximusflow.os.common.logging.Sanitize;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.internal.domain.Role;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

/**
 * No privilege escalation: an administrator can only grant permissions they hold themselves, either
 * directly on a role or through assigning a role to a user. Without this, {@code iam.user.update}
 * alone would be enough to become a system administrator.
 */
@Component
class GrantGuard {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final CurrentUser currentUser;

	GrantGuard(CurrentUser currentUser) {
		this.currentUser = currentUser;
	}

	void assertCanGrantPermissions(Set<String> permissions) {
		OsPrincipal actor = this.currentUser.require();
		Set<String> held = actor.getAuthorities().stream().map(GrantedAuthority::getAuthority)
			.collect(Collectors.toSet());
		Set<String> missing = permissions.stream().filter((p) -> !held.contains(p)).collect(Collectors.toSet());
		if (!missing.isEmpty()) {
			security.warn("privilege escalation attempt user={} missing={}", Sanitize.forLog(actor.getEmail()),
					missing);
			throw new AccessDeniedException("Cannot grant permissions the actor does not hold");
		}
	}

	void assertCanGrantRoles(Set<Role> roles) {
		assertCanGrantPermissions(
				roles.stream().flatMap((role) -> role.getPermissions().stream()).collect(Collectors.toSet()));
	}

}
