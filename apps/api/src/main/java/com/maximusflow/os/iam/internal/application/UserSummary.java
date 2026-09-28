package com.maximusflow.os.iam.internal.application;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;

import org.jspecify.annotations.Nullable;

public record UserSummary(UUID id, String email, String name, AccountStatus status, boolean locked,
		@Nullable Instant lastLoginAt, Set<RoleRef> roles, Instant createdAt, @Nullable Instant anonymizedAt) {

	public record RoleRef(UUID id, String name) {
	}

	static UserSummary of(User user, Instant now) {
		return new UserSummary(user.getId(), user.getEmail(), user.getName(), user.getStatus(), user.isLocked(now),
				user.getLastLoginAt(), user.getRoles().stream().map(UserSummary::ref).collect(Collectors.toSet()),
				user.getCreatedAt(), user.getAnonymizedAt());
	}

	private static RoleRef ref(Role role) {
		return new RoleRef(role.getId(), role.getName());
	}

}
