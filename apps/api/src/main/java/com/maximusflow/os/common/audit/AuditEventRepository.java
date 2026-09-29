package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.ListCrudRepository;

/** Only {@code save} and reads are used; the table is append-only by policy. */
interface AuditEventRepository extends ListCrudRepository<AuditEvent, UUID>, JpaSpecificationExecutor<AuditEvent> {

	/**
	 * Events per local day since {@code from}. {@code zone} is an IANA zone id already validated by
	 * {@link java.time.ZoneId#of}; it is bound as a parameter, never concatenated into the SQL.
	 */
	@Query(nativeQuery = true, value = """
			SELECT CAST(occurred_at AT TIME ZONE :zone AS date) AS day,
			       count(*) FILTER (WHERE origin = 'REST') AS rest,
			       count(*) FILTER (WHERE origin = 'AI_TOOL') AS aiTool,
			       count(*) FILTER (WHERE origin = 'SYSTEM') AS system,
			       count(*) FILTER (WHERE action = 'auth.login.success') AS loginSuccess,
			       count(*) FILTER (WHERE action = 'auth.login.failure') AS loginFailure
			FROM audit_event
			WHERE occurred_at >= :from
			GROUP BY 1
			ORDER BY 1
			""")
	List<DailyActivity> dailyActivity(@Param("from") Instant from, @Param("zone") String zone);

	interface DailyActivity {

		LocalDate getDay();

		long getRest();

		long getAiTool();

		long getSystem();

		long getLoginSuccess();

		long getLoginFailure();

	}

}
