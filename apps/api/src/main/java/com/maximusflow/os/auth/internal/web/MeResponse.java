package com.maximusflow.os.auth.internal.web;

import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.maximusflow.os.iam.AccountSnapshot;

public record MeResponse(UUID id, String email, String name, Set<String> roles, Set<String> permissions,
		boolean passwordChangeRequired) {

	static MeResponse of(AccountSnapshot account) {
		return new MeResponse(account.id(), account.email(), account.name(), new TreeSet<>(account.roleNames()),
				new TreeSet<>(account.permissions()), account.passwordChangeRequired());
	}

}
