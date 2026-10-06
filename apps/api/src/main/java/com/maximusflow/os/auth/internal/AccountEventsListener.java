package com.maximusflow.os.auth.internal;

import java.util.UUID;

import com.maximusflow.os.iam.PasswordChanged;
import com.maximusflow.os.iam.UserDirectory;
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

	private final UserDirectory userDirectory;

	AccountEventsListener(SessionTerminator sessions, UserDirectory userDirectory) {
		this.sessions = sessions;
		this.userDirectory = userDirectory;
	}

	@ApplicationModuleListener
	void on(UserDisabled event) {
		terminate(event.userId());
	}

	@ApplicationModuleListener
	void on(PasswordChanged event) {
		terminate(event.userId());
	}

	/** Sessions are indexed by e-mail (the principal name); it is resolved now, never carried by the event. */
	private void terminate(UUID userId) {
		this.userDirectory.findById(userId).ifPresent((account) -> this.sessions.terminateAll(account.email()));
	}

}
