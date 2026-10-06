package com.maximusflow.os.auth.internal;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.logging.Sanitize;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.SecondFactor;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.event.AbstractAuthenticationFailureEvent;
import org.springframework.security.authentication.event.AuthenticationFailureBadCredentialsEvent;
import org.springframework.security.authentication.event.AuthenticationSuccessEvent;
import org.springframework.security.authentication.event.LogoutSuccessEvent;
import org.springframework.stereotype.Component;

/** Security log (ASVS 16.3.1) and lockout bookkeeping for every authentication attempt. */
@Component
class AuthenticationEventsListener {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final UserDirectory userDirectory;

	private final AuditRecorder audit;

	AuthenticationEventsListener(UserDirectory userDirectory, AuditRecorder audit) {
		this.userDirectory = userDirectory;
		this.audit = audit;
	}

	@EventListener
	void onSuccess(AuthenticationSuccessEvent event) {
		if (event.getAuthentication().getPrincipal() instanceof OsPrincipal principal) {
			// With a second factor the login is not complete yet: the failure counter is shared with
			// the codes, and resetting it here would let every new password login buy more guesses.
			// The IAM module resets it when the code is accepted.
			if (!principal.isMfaEnabled()) {
				this.userDirectory.recordLoginSuccess(principal.getId());
			}
			security.info("login success user={}", principal.getId());
			// ASVS 16.3.1 records the factors used: with a second factor the password step is only the first.
			this.audit.recordFor(principal.getId(), principal.getEmail(), "auth.login.success", "user",
					principal.getId().toString(),
					Map.of("factor", "password", "secondFactor", SecondFactor.required(event.getAuthentication())
							? "pending" : "not-required"));
		}
	}

	/** Published by the logout filter while the session is still known (ASVS 16.3.1). */
	@EventListener
	void onLogout(LogoutSuccessEvent event) {
		if (event.getAuthentication().getPrincipal() instanceof OsPrincipal principal) {
			security.info("logout user={}", principal.getId());
			this.audit.recordFor(principal.getId(), principal.getEmail(), "auth.logout", "user",
					principal.getId().toString(), null);
		}
	}

	@EventListener
	void onFailure(AbstractAuthenticationFailureEvent event) {
		String email = event.getAuthentication().getName();
		String reason = event.getException().getClass().getSimpleName();
		// Only a wrong password counts towards the lockout: a disabled or locked account that typed the
		// right one is refused for another reason.
		Optional<UUID> userId = (email == null) ? Optional.empty()
				: (event instanceof AuthenticationFailureBadCredentialsEvent) ? this.userDirectory.recordLoginFailure(email)
						: this.userDirectory.findByEmail(email).map(AccountSnapshot::id);
		security.warn("login failure user={} reason={}", Sanitize.maskEmail(email), reason);
		// The trail is append-only and cannot be erased, so it names only existing accounts (by id):
		// what was typed for any other attempt (an address of someone who is no user, or a password
		// typed in the wrong field) is personal data with no purpose there. The rotating security
		// log above keeps the masked address for attack analysis.
		this.audit.recordAnonymous("auth.login.failure", null, userId.isPresent() ? "user" : null,
				userId.map(UUID::toString).orElse(null), Map.of("reason", reason));
	}

}
