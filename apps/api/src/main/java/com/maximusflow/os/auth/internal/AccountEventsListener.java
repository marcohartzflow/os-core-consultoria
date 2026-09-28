package com.maximusflow.os.auth.internal;

import com.maximusflow.os.iam.PasswordChanged;
import com.maximusflow.os.iam.UserDisabled;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Reacts to IAM events after they commit. Runs asynchronously through the event publication
 * registry, so a crash between commit and delivery is retried on restart.
 */
@Component
class AccountEventsListener {

	private final SessionTerminator sessions;

	AccountEventsListener(SessionTerminator sessions) {
		this.sessions = sessions;
	}

	@ApplicationModuleListener
	void on(UserDisabled event) {
		this.sessions.terminateAll(event.email());
	}

	@ApplicationModuleListener
	void on(PasswordChanged event) {
		this.sessions.terminateAll(event.email());
	}

}
