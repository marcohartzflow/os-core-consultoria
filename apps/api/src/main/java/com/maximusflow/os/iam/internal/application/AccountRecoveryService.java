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

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Unauthenticated flows: accept an invitation, request and confirm a password reset. */
@Service
@Transactional
public class AccountRecoveryService {

	private static final Logger log = LoggerFactory.getLogger(AccountRecoveryService.class);

	private final UserRepository users;

	private final AccountTokens tokens;

	private final PasswordPolicy passwordPolicy;

	private final AccountNotifier notifier;

	private final AppLinks links;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final ApplicationEventPublisher events;

	private final AsyncTaskExecutor executor;

	private final TransactionTemplate ownTransaction;

	AccountRecoveryService(UserRepository users, AccountTokens tokens, PasswordPolicy passwordPolicy,
			AccountNotifier notifier, AppLinks links, IamProperties properties, AuditRecorder audit,
			ApplicationEventPublisher events, AsyncTaskExecutor applicationTaskExecutor,
			PlatformTransactionManager transactions) {
		this.executor = applicationTaskExecutor;
		this.ownTransaction = new TransactionTemplate(transactions);
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
		// A disabled (or already active) account is not activated by an old link.
		if (user.getStatus() != AccountStatus.INVITED) {
			throw new DomainRuleException("Link inválido ou expirado");
		}
		user.setPassword(this.passwordPolicy.validateAndHash(password, user.getEmail()));
		this.audit.recordAnonymous("iam.user.activated", user.getEmail(), "user", user.getId().toString(), null);
	}

	/**
	 * Always succeeds from the caller's point of view so e-mails cannot be enumerated: the request
	 * does the same work whether the account exists or not (one audit row without the typed address),
	 * and the lookup, token and e-mail happen after it has answered (OWASP Forgot Password Cheat
	 * Sheet: "using asynchronous calls"). An address that is no account leaves no trace.
	 */
	public void requestPasswordReset(String email) {
		String normalized = User.normalizeEmail(email);
		this.audit.recordAnonymous("iam.password_reset.requested", null, null, null, null);
		this.executor.execute(() -> {
			try {
				PasswordResetMail mail = this.ownTransaction.execute((status) -> issuePasswordReset(normalized));
				// Outside the transaction: the token is committed before the link can arrive, and the
				// SMTP round trip holds no database connection.
				if (mail != null) {
					this.notifier.sendPasswordReset(mail.to(), mail.name(), mail.link());
				}
			}
			catch (RuntimeException ex) {
				log.error("Password reset could not be issued", ex);
			}
		});
	}

	private record PasswordResetMail(String to, String name, String link) {
	}

	private @Nullable PasswordResetMail issuePasswordReset(String email) {
		User user = this.users.findByEmail(email).filter((u) -> u.getStatus() == AccountStatus.ACTIVE).orElse(null);
		if (user == null) {
			return null;
		}
		String raw = this.tokens.issue(user, TokenType.PASSWORD_RESET, this.properties.tokens().passwordResetTtl());
		this.audit.recordFor(user.getId(), user.getEmail(), "iam.password_reset.issued", "user",
				user.getId().toString(), null);
		return new PasswordResetMail(user.getEmail(), user.getName(), this.links.passwordReset(raw));
	}

	public void confirmPasswordReset(String rawToken, String password) {
		AccountToken token = this.tokens.consume(rawToken, TokenType.PASSWORD_RESET);
		User user = token.getUser();
		if (user.getStatus() != AccountStatus.ACTIVE) {
			throw new DomainRuleException("Link inválido ou expirado");
		}
		user.setPassword(this.passwordPolicy.validateAndHash(password, user.getEmail()));
		this.events.publishEvent(new PasswordChanged(user.getId()));
		// Account recovery (NIST SP 800-63B-4, Sec. 4.6): every address of the account hears about it.
		this.events.publishEvent(new AccountLinkMailer.SecurityNotice(user.getId(),
				"A sua senha foi redefinida pelo link enviado ao seu e-mail, e todas as sessões abertas foram encerradas."));
		this.audit.recordAnonymous("iam.password_reset.completed", user.getEmail(), "user", user.getId().toString(),
				Map.of("via", "reset-link"));
	}

}
