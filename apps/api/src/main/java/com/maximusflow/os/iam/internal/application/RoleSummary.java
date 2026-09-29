package com.maximusflow.os.iam.internal.application;

import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.Role;

import org.jspecify.annotations.Nullable;

public record RoleSummary(UUID id, String name, @Nullable String description, boolean system, Set<String> permissions,
		long userCount) {

	static RoleSummary of(Role role, long userCount) {
		return new RoleSummary(role.getId(), role.getName(), role.getDescription(), role.isSystem(),
				new TreeSet<>(role.getPermissions()), userCount);
	}

}
