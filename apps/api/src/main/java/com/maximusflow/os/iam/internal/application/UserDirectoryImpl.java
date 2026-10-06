package com.maximusflow.os.iam.internal.application;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.MfaStatus;
import com.maximusflow.os.iam.UserDirectory;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.AccountTokenRepository;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
class UserDirectoryImpl implements UserDirectory {

	private final UserRepository users;

	private final PasswordPolicy passwordPolicy;

	private final AuditRecorder audit;

	private final MfaService mfa;

	private final AccountTokenRepository tokens;

	private final LoginAttempts attempts;

	private final GrantGuard grantGuard;

	private final ApplicationEventPublisher events;

	UserDirectoryImpl(UserRepository users, PasswordPolicy passwordPolicy, AuditRecorder audit, MfaService mfa,
			AccountTokenRepository tokens, LoginAttempts attempts, GrantGuard grantGuard,
			ApplicationEventPublisher events) {
		this.events = events;
		this.grantGuard = grantGuard;
		this.attempts = attempts;
		this.mfa = mfa;
		this.tokens = tokens;
		this.users = users;
		this.passwordPolicy = passwordPolicy;
		this.audit = audit;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<AccountSnapshot> findByEmail(String email) {
		return this.users.findByEmail(User.normalizeEmail(email)).map(this::snapshot);
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<AccountSnapshot> findById(UUID id) {
		return this.users.findWithRolesById(id).map(this::snapshot);
	}

	@Override
	@Transactional(readOnly = true)
	public Map<UUID, String> namesByIds(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return this.users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, User::getName));
	}

	@Override
	public Optional<UUID> recordLoginFailure(String email) {
		Optional<UUID> userId = this.users.findByEmail(User.normalizeEmail(email)).map(User::getId);
		userId.ifPresent(this.attempts::failed);
		return userId;
	}

	@Override
	public void recordLoginSuccess(UUID userId) {
		this.attempts.succeeded(userId);
	}

	@Override
	public void upgradePasswordHash(UUID userId, String encodedHash) {
		this.users.findById(userId).ifPresent((user) -> {
			user.upgradePasswordHash(encodedHash);
			this.audit.recordFor(userId, user.getEmail(), "iam.password.rehashed", "user", userId.toString(), null);
		});
	}

	@Override
	public void changePassword(UUID userId, String currentPassword, String newPassword) {
		User user = this.users.findById(userId).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		user.setPassword(this.passwordPolicy.validateAndHash(newPassword, user.getEmail()));
		// A reset link requested earlier must not outlive the password it was meant to replace.
		this.tokens.deleteByUserAndType(user, TokenType.PASSWORD_RESET);
		this.audit.record("iam.password.changed", "user", user.getId().toString(), Map.of("via", "self-service"));
		// A changed credential is told to every address of the account, after commit.
		this.events.publishEvent(new AccountLinkMailer.SecurityNotice(userId,
				"A sua senha foi alterada nas configurações de segurança, e as outras sessões abertas foram encerradas."));
	}

	@Override
	public void changeNotificationEmail(UUID userId, String currentPassword, @Nullable String email) {
		User user = this.users.findById(userId).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		String next = (email != null && !email.isBlank()) ? User.normalizeEmail(email) : null;
		if (user.getEmail().equals(next)) {
			throw new DomainRuleException("Informe um e-mail diferente do seu e-mail de acesso");
		}
		String previous = user.getNotificationEmail();
		if (Objects.equals(previous, next)) {
			return;
		}
		user.changeNotificationEmail(next);
		this.audit.record("iam.notification_email.changed", "user", userId.toString(),
				Map.of("set", next != null));
		// The login e-mail, the new address and the one it replaces all hear about it: whoever took the
		// session cannot quietly redirect the notices.
		String notice = (next != null)
				? "O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser " + next + "."
				: "O e-mail secundário que recebia os avisos de segurança da sua conta foi removido.";
		this.events.publishEvent(new AccountLinkMailer.SecurityNotice(userId, notice,
				(previous != null) ? List.of(previous) : List.of()));
	}

	@Override
	@Transactional(readOnly = true)
	public void assertCanManage(UUID userId) {
		this.grantGuard.assertCanManage(
				this.users.findWithRolesById(userId).orElseThrow(() -> new NotFoundException("Usuário não encontrado")));
	}

	@Override
	@Transactional(readOnly = true)
	public MfaStatus mfaStatus(UUID userId) {
		return this.mfa.status(userId);
	}

	@Override
	public boolean verifyMfa(UUID userId, String code) {
		return this.mfa.verify(userId, code);
	}

	private AccountSnapshot snapshot(User user) {
		MfaStatus mfaStatus = this.mfa.status(user);
		return new AccountSnapshot(user.getId(), user.getEmail(), user.getNotificationEmail(), user.getName(),
				user.getPasswordHash(),
				user.getStatus(), user.getLockedUntil(), user.isLockedPermanently(), user.isPasswordChangeRequired(), mfaStatus.enabled(),
				mfaStatus.required(),
				user.getRoles().stream().map(Role::getName).collect(Collectors.toSet()), user.permissions());
	}

}
