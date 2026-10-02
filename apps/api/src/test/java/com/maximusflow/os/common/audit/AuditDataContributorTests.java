package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The subject's export (LGPD art. 18 II) shows what was done to their account, but not the e-mail or
 * IP of the administrator who did it.
 */
class AuditDataContributorTests {

	private static final UUID SUBJECT = UUID.randomUUID();

	private static final UUID ADMIN = UUID.randomUUID();

	@Test
	void anAdministratorsActionOnTheAccountKeepsWhatAndWhenButNotWhoseEmailOrIp() {
		Instant at = Instant.parse("2026-09-30T12:00:00Z");
		AuditEvent disabled = new AuditEvent(at, ADMIN, "admin@example.com", AuditOrigin.REST, "iam.user.disabled",
				"user", SUBJECT.toString(), null, "203.0.113.7", "c-1");

		AuditEventView view = AuditDataContributor.forSubject(disabled, SUBJECT, "dora@example.com");

		assertThat(view.action()).isEqualTo("iam.user.disabled");
		assertThat(view.occurredAt()).isEqualTo(at);
		assertThat(view.origin()).isEqualTo(AuditOrigin.REST);
		assertThat(view.actorId()).isEqualTo(ADMIN);
		assertThat(view.entityId()).isEqualTo(SUBJECT.toString());
		assertThat(view.actorEmail()).isNull();
		assertThat(view.ip()).isNull();
	}

	@Test
	void theSubjectsOwnEntriesAreExportedWhole() {
		AuditEvent login = new AuditEvent(Instant.now(), SUBJECT, "dora@example.com", AuditOrigin.REST,
				"auth.login.success", "user", SUBJECT.toString(), null, "198.51.100.4", null);
		// Attempts with their e-mail and no session (failed login) are theirs too, matched case-insensitively.
		AuditEvent failed = new AuditEvent(Instant.now(), null, "Dora@Example.com", AuditOrigin.REST,
				"auth.login.failure", null, null, null, "198.51.100.5", null);

		assertThat(AuditDataContributor.forSubject(login, SUBJECT, "dora@example.com").actorEmail())
			.isEqualTo("dora@example.com");
		assertThat(AuditDataContributor.forSubject(login, SUBJECT, "dora@example.com").ip()).isEqualTo("198.51.100.4");
		assertThat(AuditDataContributor.forSubject(failed, SUBJECT, "dora@example.com").ip()).isEqualTo("198.51.100.5");
	}

}
