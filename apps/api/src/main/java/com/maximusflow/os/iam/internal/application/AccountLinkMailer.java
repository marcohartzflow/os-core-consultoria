package com.maximusflow.os.iam.internal.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.TokenType;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Mails account links after the transaction that asked for them commits. Asynchronous, and tracked
 * by the Spring Modulith event publication registry, so a delivery that fails is retried on restart.
 * An SMTP failure no longer rolls the use case back, and a link is only created once the change it
 * belongs to is committed. Not {@code @ApplicationModuleListener}: that runs the whole listener in
 * one transaction, and the e-mail would leave before the token it carries is committed.
 */
@Component
class AccountLinkMailer {

	/** An invitation was created or resent. Carries no token: the link is issued on delivery. */
	record InvitationRequested(UUID userId) {
	}

	/** An administrator removed the person's second factor and their password (OWASP ASVS 5.0 6.4.4). */
	record SecondFactorReset(UUID userId) {
	}

	/** A second factor was added or removed, or the recovery codes replaced; {@code change} says which. */
	record FactorChanged(UUID userId, String change) {
	}

	/**
	 * Account recovery or a credential change (recovery code used, password reset by link, password
	 * changed, second notification address changed): a notice to every address of the account. NIST
	 * SP 800-63B-4: "account recovery SHALL cause a notification to be sent to the subscriber".
	 * {@code alsoTo}: addresses that no longer belong to the account but must hear about it (the
	 * second address just replaced or removed).
	 */
	record SecurityNotice(UUID userId, String notice, List<String> alsoTo) {

		SecurityNotice(UUID userId, String notice) {
			this(userId, notice, List.of());
		}

	}

	private record Delivery(String email, String name, String link, List<String> otherAddresses) {
	}

	private final UserRepository users;

	private final AccountTokens tokens;

	private final AccountNotifier notifier;

	private final AppLinks links;

	private final IamProperties properties;

	private final TransactionTemplate ownTransaction;

	AccountLinkMailer(UserRepository users, AccountTokens tokens, AccountNotifier notifier, AppLinks links,
			IamProperties properties, PlatformTransactionManager transactions) {
		this.users = users;
		this.tokens = tokens;
		this.notifier = notifier;
		this.links = links;
		this.properties = properties;
		this.ownTransaction = new TransactionTemplate(transactions);
		this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
	}

	/** An account no longer waiting for its invitation (disabled, active) gets nothing. */
	@Async
	@TransactionalEventListener
	void on(InvitationRequested event) {
		Delivery delivery = issue(event.userId(), AccountStatus.INVITED, TokenType.INVITATION);
		if (delivery != null) {
			this.notifier.sendInvitation(delivery.email(), delivery.name(), delivery.link());
		}
	}

	/**
	 * The link is a password-reset link: choosing a new password proves the e-mail again. It goes to
	 * the login e-mail only; the second address gets a notice without it.
	 */
	@Async
	@TransactionalEventListener
	void on(SecondFactorReset event) {
		Delivery delivery = issue(event.userId(), AccountStatus.ACTIVE, TokenType.PASSWORD_RESET);
		if (delivery != null) {
			this.notifier.sendSecondFactorReset(delivery.email(), delivery.name(), delivery.link());
			delivery.otherAddresses()
				.forEach((address) -> this.notifier.sendSecurityNotice(address, delivery.name(),
						"Um administrador removeu o segundo fator da sua conta e a sua senha deixou de valer. "
								+ "O link para escolher uma nova senha foi enviado ao seu e-mail de acesso."));
		}
	}

	/** A notice only, no link, to every address: whoever did not make the change learns about it. */
	@Async
	@TransactionalEventListener
	void on(FactorChanged event) {
		this.users.findById(event.userId())
			.ifPresent((user) -> user.noticeAddresses()
				.forEach((address) -> this.notifier.sendSecondFactorChanged(address, user.getName(), event.change())));
	}

	/** A notice only, no link, to every address of the account and to {@code alsoTo}. */
	@Async
	@TransactionalEventListener
	void on(SecurityNotice event) {
		this.users.findById(event.userId()).ifPresent((user) -> {
			Set<String> addresses = new LinkedHashSet<>(user.noticeAddresses());
			addresses.addAll(event.alsoTo());
			addresses.forEach((address) -> this.notifier.sendSecurityNotice(address, user.getName(), event.notice()));
		});
	}

	/**
	 * Issues the token in its own transaction, so it is committed before the e-mail leaves. A failed
	 * send fails the delivery, and the retry issues a fresh token (replacing this one).
	 */
	private @Nullable Delivery issue(UUID userId, AccountStatus expected, TokenType type) {
		return this.ownTransaction.execute((status) -> this.users.findById(userId)
			.filter((user) -> user.getStatus() == expected)
			.map((user) -> new Delivery(user.getEmail(), user.getName(), link(user, type),
					user.noticeAddresses().subList(1, user.noticeAddresses().size())))
			.orElse(null));
	}

	private String link(User user, TokenType type) {
		if (type == TokenType.INVITATION) {
			return this.links.invitation(this.tokens.issue(user, type, this.properties.tokens().invitationTtl()));
		}
		return this.links.passwordReset(this.tokens.issue(user, type, this.properties.tokens().passwordResetTtl()));
	}

}
