package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
class UserDirectoryImpl implements UserDirectory {

	private final UserRepository users;

	private final PasswordPolicy passwordPolicy;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final Clock clock;

	UserDirectoryImpl(UserRepository users, PasswordPolicy passwordPolicy, IamProperties properties,
			AuditRecorder audit, Clock clock) {
		this.users = users;
		this.passwordPolicy = passwordPolicy;
		this.properties = properties;
		this.audit = audit;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<AccountSnapshot> findByEmail(String email) {
		return this.users.findByEmail(User.normalizeEmail(email)).map(UserDirectoryImpl::snapshot);
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<AccountSnapshot> findById(UUID id) {
		return this.users.findWithRolesById(id).map(UserDirectoryImpl::snapshot);
	}

	@Override
	public void recordLoginFailure(String email) {
		this.users.findByEmail(User.normalizeEmail(email)).ifPresent((user) -> {
			var lockout = this.properties.lockout();
			user.recordLoginFailure(this.clock.instant(), lockout.maxAttempts(), lockout.duration());
		});
	}

	@Override
	public void recordLoginSuccess(UUID userId) {
		this.users.findById(userId).ifPresent((user) -> user.recordLoginSuccess(this.clock.instant()));
	}

	@Override
	public void changePassword(UUID userId, String currentPassword, String newPassword) {
		User user = this.users.findById(userId).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
		String hash = user.getPasswordHash();
		if (hash == null || !this.passwordPolicy.matches(currentPassword, hash)) {
			throw new DomainRuleException("Senha atual incorreta");
		}
		user.setPassword(this.passwordPolicy.validateAndHash(newPassword));
		this.audit.record("iam.password.changed", "user", user.getId().toString(), Map.of("via", "self-service"));
	}

	private static AccountSnapshot snapshot(User user) {
		return new AccountSnapshot(user.getId(), user.getEmail(), user.getName(), user.getPasswordHash(),
				user.getStatus(), user.getLockedUntil(), user.isPasswordChangeRequired(),
				user.getRoles().stream().map(Role::getName).collect(Collectors.toSet()), user.permissions());
	}

}
