package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.AccountTokenRepository;
import com.maximusflow.os.iam.internal.persistence.MfaRecoveryCodeRepository;
import com.maximusflow.os.iam.internal.persistence.UserMfaRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/** The account itself. Erasing replaces every identifying field and drops credentials and tokens. */
@Component
class AccountDataContributor implements PersonalDataContributor {

	record AccountExport(UUID id, String email, String name, AccountStatus status, Set<String> roles,
			Instant createdAt, @Nullable Instant lastLoginAt) {
	}

	private final UserRepository users;

	private final AccountTokenRepository tokens;

	private final UserMfaRepository mfa;

	private final MfaRecoveryCodeRepository recoveryCodes;

	private final Clock clock;

	AccountDataContributor(UserRepository users, AccountTokenRepository tokens, UserMfaRepository mfa,
			MfaRecoveryCodeRepository recoveryCodes, Clock clock) {
		this.users = users;
		this.tokens = tokens;
		this.mfa = mfa;
		this.recoveryCodes = recoveryCodes;
		this.clock = clock;
	}

	@Override
	public String key() {
		return "account";
	}

	@Override
	public @Nullable AccountExport export(UUID userId, String email) {
		return this.users.findWithRolesById(userId)
			.map((user) -> new AccountExport(user.getId(), user.getEmail(), user.getName(), user.getStatus(),
					user.getRoles().stream().map(Role::getName).collect(java.util.stream.Collectors.toSet()),
					user.getCreatedAt(), user.getLastLoginAt()))
			.orElse(null);
	}

	@Override
	public void erase(UUID userId, String email) {
		this.users.findWithRolesById(userId).ifPresent((user) -> {
			this.tokens.deleteByUser(user);
			this.recoveryCodes.deleteByUserId(user.getId());
			this.mfa.deleteById(user.getId());
			user.anonymize(this.clock.instant());
		});
	}

}
