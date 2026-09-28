package com.maximusflow.os.auth.internal.web;

import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.maximusflow.os.iam.AccountSnapshot;

public record MeResponse(UUID id, String email, String name, Set<String> roles, Set<String> permissions,
		boolean passwordChangeRequired, Mfa mfa) {

	/** {@code verified} is per session: false right after login until the code is accepted. */
	public record Mfa(boolean enabled, boolean required, boolean verified) {
	}

	static MeResponse of(AccountSnapshot account, boolean mfaVerified) {
		return new MeResponse(account.id(), account.email(), account.name(), new TreeSet<>(account.roleNames()),
				new TreeSet<>(account.permissions()), account.passwordChangeRequired(),
				new Mfa(account.mfaEnabled(), account.mfaRequired(), mfaVerified));
	}

}
