package com.maximusflow.os.auth.internal;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.springframework.stereotype.Component;

/** Active sessions of the person; erasing means ending them all. */
@Component
class SessionsDataContributor implements PersonalDataContributor {

	private final SessionTerminator sessions;

	SessionsDataContributor(SessionTerminator sessions) {
		this.sessions = sessions;
	}

	@Override
	public String key() {
		return "sessions";
	}

	@Override
	public List<SessionTerminator.SessionInfo> export(UUID userId, String email) {
		return this.sessions.list(email, null);
	}

	@Override
	public void erase(UUID userId, String email) {
		this.sessions.terminateAll(email);
	}

}
