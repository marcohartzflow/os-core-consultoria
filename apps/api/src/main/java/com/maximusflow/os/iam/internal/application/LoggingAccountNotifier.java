package com.maximusflow.os.iam.internal.application;

import com.maximusflow.os.common.logging.Sanitize;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Fallback;
import org.springframework.stereotype.Component;

/**
 * Default notifier: writes the link to the application log. Fine for development and for clients
 * whose administrators hand the link over directly (the API also returns it to the administrator).
 * Marked {@link Fallback}: any other {@link AccountNotifier} bean (e.g. e-mail) takes precedence.
 * The {@code prod} profile raises this logger to WARN so links never reach shipped logs.
 */
@Component
@Fallback
class LoggingAccountNotifier implements AccountNotifier {

	private static final Logger log = LoggerFactory.getLogger(LoggingAccountNotifier.class);

	@Override
	public void sendInvitation(String email, String name, String link) {
		log.info("Invitation for {} <{}>: {}", Sanitize.forLog(name), Sanitize.forLog(email), link);
	}

	@Override
	public void sendPasswordReset(String email, String name, String link) {
		log.info("Password reset for {} <{}>: {}", Sanitize.forLog(name), Sanitize.forLog(email), link);
	}

	@Override
	public void sendSecondFactorReset(String email, String name, String link) {
		log.info("Second-factor reset for {} <{}>: {}", Sanitize.forLog(name), Sanitize.forLog(email), link);
	}

	@Override
	public void sendSecondFactorChanged(String email, String name, String change) {
		log.info("Second-factor change for {} <{}>: {}", Sanitize.forLog(name), Sanitize.forLog(email),
				Sanitize.forLog(change));
	}

	@Override
	public void sendSecurityNotice(String email, String name, String notice) {
		log.info("Security notice for {} <{}>: {}", Sanitize.forLog(name), Sanitize.forLog(email),
				Sanitize.forLog(notice));
	}

	@Override
	public void sendAdministratorGranted(String email, String name, String granteeName, String granteeEmail,
			String grantedByName) {
		log.info("Administrator notice for {}: {} <{}> is now an administrator (granted by {})",
				Sanitize.forLog(email), Sanitize.forLog(granteeName), Sanitize.forLog(granteeEmail),
				Sanitize.forLog(grantedByName));
	}

	@Override
	public boolean handsLinksToAdministrator() {
		return true;
	}

}
