package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.AccountTokenRepository;
import com.maximusflow.os.iam.internal.persistence.MfaRecoveryCodeRepository;
import com.maximusflow.os.iam.internal.persistence.UserMfaRepository;
import com.maximusflow.os.iam.internal.persistence.UserPasskeyRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.stereotype.Component;

/** The account itself. Erasing replaces every identifying field and drops credentials and tokens. */
@Component
class AccountDataContributor implements PersonalDataContributor {

	/** {@code notificationEmail}: the optional second address for security notices. */
	record AccountExport(UUID id, String email, @Nullable String notificationEmail, String name, AccountStatus status,
			Set<String> roles, Instant createdAt, @Nullable Instant lastLoginAt, List<PasskeyExport> passkeys) {
	}

	/** A registered passkey as the person named it; the public key itself identifies no one. */
	record PasskeyExport(String label, @Nullable Instant createdAt, @Nullable Instant lastUsedAt) {
	}

	private final UserRepository users;

	private final AccountTokenRepository tokens;

	private final UserMfaRepository mfa;

	private final MfaRecoveryCodeRepository recoveryCodes;

	private final UserPasskeyRepository passkeyLinks;

	private final UserCredentialRepository passkeyCredentials;

	private final PublicKeyCredentialUserEntityRepository passkeyUserEntities;

	private final Clock clock;

	AccountDataContributor(UserRepository users, AccountTokenRepository tokens, UserMfaRepository mfa,
			MfaRecoveryCodeRepository recoveryCodes, Clock clock, UserPasskeyRepository passkeyLinks,
			UserCredentialRepository passkeyCredentials, PublicKeyCredentialUserEntityRepository passkeyUserEntities) {
		this.passkeyLinks = passkeyLinks;
		this.passkeyCredentials = passkeyCredentials;
		this.passkeyUserEntities = passkeyUserEntities;
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
			.map((user) -> new AccountExport(user.getId(), user.getEmail(), user.getNotificationEmail(), user.getName(),
					user.getStatus(),
					user.getRoles().stream().map(Role::getName).collect(java.util.stream.Collectors.toSet()),
					user.getCreatedAt(), user.getLastLoginAt(), passkeys(user.getId())))
			.orElse(null);
	}

	private List<PasskeyExport> passkeys(UUID userId) {
		return this.passkeyLinks.findByUserId(userId).stream()
			.map((link) -> this.passkeyCredentials.findByCredentialId(Passkeys.bytes(link.getCredentialId())))
			.filter((credential) -> credential != null)
			.map((credential) -> new PasskeyExport(credential.getLabel(), credential.getCreated(), credential.getLastUsed()))
			.toList();
	}

	@Override
	public void erase(UUID userId, String email) {
		this.users.findWithRolesById(userId).ifPresent((user) -> {
			this.tokens.deleteByUser(user);
			this.recoveryCodes.deleteByUserId(user.getId());
			this.mfa.deleteById(user.getId());
			Passkeys.removeAll(user.getId(), this.passkeyLinks, this.passkeyCredentials);
			var userEntity = this.passkeyUserEntities.findByUsername(user.getEmail());
			if (userEntity != null) {
				this.passkeyUserEntities.delete(userEntity.getId());
			}
			user.anonymize(this.clock.instant());
		});
	}

}
