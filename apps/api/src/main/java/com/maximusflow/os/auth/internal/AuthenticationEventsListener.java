package com.maximusflow.os.auth.internal;

import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.logging.Sanitize;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.UserDirectory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.event.AbstractAuthenticationFailureEvent;
import org.springframework.security.authentication.event.AuthenticationFailureBadCredentialsEvent;
import org.springframework.security.authentication.event.AuthenticationSuccessEvent;
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
			this.userDirectory.recordLoginSuccess(principal.getId());
			security.info("login success user={}", Sanitize.forLog(principal.getEmail()));
			this.audit.record("auth.login.success", "user", principal.getId().toString(), null);
		}
	}

	@EventListener
	void onFailure(AbstractAuthenticationFailureEvent event) {
		String email = event.getAuthentication().getName();
		String reason = event.getException().getClass().getSimpleName();
		if (event instanceof AuthenticationFailureBadCredentialsEvent) {
			this.userDirectory.recordLoginFailure(email);
		}
		security.warn("login failure user={} reason={}", Sanitize.forLog(email), reason);
		this.audit.recordAnonymous("auth.login.failure", Sanitize.forLog(email), null, null,
				Map.of("reason", reason));
	}

}
