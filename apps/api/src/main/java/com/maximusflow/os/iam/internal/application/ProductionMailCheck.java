package com.maximusflow.os.iam.internal.application;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * In production every invitation and reset link must reach the person by e-mail: accepting the
 * invitation is what proves the address belongs to them. Handing links to the administrator (the
 * logging notifier) is for local development only, so production refuses to start without SMTP.
 */
@Component
class ProductionMailCheck {

	ProductionMailCheck(AccountNotifier notifier, Environment environment) {
		if (environment.acceptsProfiles(Profiles.of("prod")) && notifier.handsLinksToAdministrator()) {
			throw new IllegalStateException(
					"SPRING_MAIL_HOST and OS_MAIL_FROM are required in production: invitations and password resets are delivered by e-mail only");
		}
	}

}
