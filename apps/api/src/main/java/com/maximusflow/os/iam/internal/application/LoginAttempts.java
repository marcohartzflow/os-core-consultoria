package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The per-account failure counter behind the lockout. Wrong passwords at login, wrong second-factor
 * codes and wrong passwords typed to confirm a sensitive change (new password, second factor,
 * administrator grant) all count against the same number, so none of them is a way around the
 * others. The row is locked while counting, so parallel attempts cannot lose increments.
 */
@Component
class LoginAttempts {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final UserRepository users;

	private final PasswordPolicy passwordPolicy;

	private final IamProperties.Lockout lockout;

	private final AuditRecorder audit;

	private final Clock clock;

	private final TransactionTemplate ownTransaction;

	LoginAttempts(UserRepository users, PasswordPolicy passwordPolicy, IamProperties properties, AuditRecorder audit,
			Clock clock, PlatformTransactionManager transactions) {
		this.ownTransaction = new TransactionTemplate(transactions);
		this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
		this.users = users;
		this.passwordPolicy = passwordPolicy;
		this.lockout = properties.lockout();
		this.audit = audit;
		this.clock = clock;
	}

	/**
	 * Counts one failure and locks the account when it reaches the limit. Commits on its own: the
	 * request that failed usually ends in an error that rolls its own transaction back, and the
	 * failure must stay counted.
	 *
	 * @return whether the account is locked now
	 */
	public boolean failed(UUID userId) {
		// A template, not @Transactional: confirmPassword calls this from the same bean, where the
		// annotation would be skipped.
		return Boolean.TRUE.equals(this.ownTransaction.execute((status) -> {
			User user = this.users.lockById(userId).orElse(null);
			if (user == null) {
				return false;
			}
			Instant now = this.clock.instant();
			if (user.isLocked(now)) {
				// Already locked: attempts during the lock neither count nor extend it.
				return true;
			}
			user.recordLoginFailure(now, this.lockout.policy());
			boolean locked = user.isLocked(now);
			if (locked) {
				String until = user.isLockedPermanently() ? "password-reset" : String.valueOf(user.getLockedUntil());
				security.warn("account locked user={} until={}", userId, until);
				this.audit.recordFor(userId, user.getEmail(), "iam.user.locked", "user", userId.toString(),
						Map.of("until", until));
			}
			return locked;
		}));
	}

	/** A complete login (password, and second factor when enrolled): the counter starts over. */
	@Transactional
	public void succeeded(UUID userId) {
		this.users.lockById(userId).ifPresent((user) -> user.recordLoginSuccess(this.clock.instant()));
	}

	/**
	 * The acting person re-types their password to confirm a sensitive change. A wrong password counts
	 * as a failed login, and a locked account cannot confirm anything, so a stolen session cannot be
	 * used to guess the password.
	 */
	public void confirmPassword(User user, @Nullable String password, String wrongPasswordMessage) {
		if (user.isLocked(this.clock.instant())) {
			throw new DomainRuleException("Conta bloqueada temporariamente por tentativas erradas. Tente mais tarde");
		}
		if (password == null || password.isEmpty()) {
			// Nothing typed yet (the screen asks for it): not a guess, so not counted.
			throw new DomainRuleException(wrongPasswordMessage);
		}
		String hash = user.getPasswordHash();
		if (hash == null || !this.passwordPolicy.matches(password, hash)) {
			security.warn("password confirmation failed user={}", user.getId());
			failed(user.getId());
			throw new DomainRuleException(wrongPasswordMessage);
		}
		renewSessionId();
	}

	/**
	 * OWASP ASVS 5.0 7.2.4: a new session token "on user authentication, including
	 * re-authentication". The password just typed again is a re-authentication, so the session keeps
	 * its attributes (second factors passed, pending ceremonies) under a new id, through Spring
	 * Session's {@code changeSessionId}; the browser follows the new cookie. The CSRF token is not
	 * tied to the session id and stays valid. Outside an HTTP request (nothing to rotate), or once the
	 * response is committed (the cookie could no longer reach the browser), nothing changes.
	 */
	private static void renewSessionId() {
		if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
			return;
		}
		HttpServletRequest request = attributes.getRequest();
		HttpServletResponse response = attributes.getResponse();
		if (request.getSession(false) != null && (response == null || !response.isCommitted())) {
			request.changeSessionId();
		}
	}

}
