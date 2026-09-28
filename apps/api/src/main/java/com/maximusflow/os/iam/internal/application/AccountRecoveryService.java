package com.maximusflow.os.iam.internal.application;

import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.PasswordChanged;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.AccountToken;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Unauthenticated flows: accept an invitation, request and confirm a password reset. */
@Service
@Transactional
public class AccountRecoveryService {

	private final UserRepository users;

	private final AccountTokens tokens;

	private final PasswordPolicy passwordPolicy;

	private final AccountNotifier notifier;

	private final AppLinks links;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final ApplicationEventPublisher events;

	AccountRecoveryService(UserRepository users, AccountTokens tokens, PasswordPolicy passwordPolicy,
			AccountNotifier notifier, AppLinks links, IamProperties properties, AuditRecorder audit,
			ApplicationEventPublisher events) {
		this.users = users;
		this.tokens = tokens;
		this.passwordPolicy = passwordPolicy;
		this.notifier = notifier;
		this.links = links;
		this.properties = properties;
		this.audit = audit;
		this.events = events;
	}

	public void acceptInvitation(String rawToken, String password) {
		AccountToken token = this.tokens.consume(rawToken, TokenType.INVITATION);
		User user = token.getUser();
		user.setPassword(this.passwordPolicy.validateAndHash(password));
		this.audit.recordAnonymous("iam.user.activated", user.getEmail(), "user", user.getId().toString(), null);
	}

	/** Always succeeds from the caller's point of view so e-mails cannot be enumerated. */
	public void requestPasswordReset(String email) {
		this.users.findByEmail(User.normalizeEmail(email))
			.filter((user) -> user.getStatus() == AccountStatus.ACTIVE)
			.ifPresent((user) -> {
				String raw = this.tokens.issue(user, TokenType.PASSWORD_RESET,
						this.properties.tokens().passwordResetTtl());
				this.notifier.sendPasswordReset(user.getEmail(), user.getName(), this.links.passwordReset(raw));
				this.audit.recordAnonymous("iam.password_reset.requested", user.getEmail(), "user",
						user.getId().toString(), null);
			});
	}

	public void confirmPasswordReset(String rawToken, String password) {
		AccountToken token = this.tokens.consume(rawToken, TokenType.PASSWORD_RESET);
		User user = token.getUser();
		if (user.getStatus() != AccountStatus.ACTIVE) {
			throw new DomainRuleException("Link inválido ou expirado");
		}
		user.setPassword(this.passwordPolicy.validateAndHash(password));
		this.events.publishEvent(new PasswordChanged(user.getId(), user.getEmail()));
		this.audit.recordAnonymous("iam.password_reset.completed", user.getEmail(), "user", user.getId().toString(),
				Map.of("via", "reset-link"));
	}

}
