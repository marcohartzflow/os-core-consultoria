package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.ListCrudRepository;

/** Only {@code save} and reads are used; the table is append-only by policy. */
interface AuditEventRepository extends ListCrudRepository<AuditEvent, UUID>, JpaSpecificationExecutor<AuditEvent> {

	/**
	 * Serializes {@link #refreshActivityBuckets}: two dashboards refreshing at once would otherwise
	 * lock the same bucket rows in different orders. Held until the transaction ends.
	 */
	@Query(nativeQuery = true, value = "SELECT pg_advisory_xact_lock(hashtext('audit_activity_bucket'))")
	Object lockActivityBuckets();

	/** Start of the newest 15-minute bucket counted so far; null before the first refresh. */
	@Query(nativeQuery = true, value = "SELECT max(bucket) FROM audit_activity_bucket")
	@Nullable Instant latestActivityBucket();

	/**
	 * Recounts the 15-minute buckets from {@code since} (a bucket start) on. {@code since} is a
	 * value, not a subquery, so the planner sees how few events it selects and reads them through
	 * the occurred_at index (as a subquery it guessed a third of the table and scanned all of it:
	 * 350 ms instead of about 1 ms on 3 million events).
	 */
	@Modifying
	@Query(nativeQuery = true, value = """
			INSERT INTO audit_activity_bucket (bucket, rest, ai_tool, system, login_success, login_failure)
			SELECT date_bin('15 minutes', occurred_at, TIMESTAMPTZ '2000-01-01 00:00:00+00'),
			       count(*) FILTER (WHERE origin = 'REST'),
			       count(*) FILTER (WHERE origin = 'AI_TOOL'),
			       count(*) FILTER (WHERE origin = 'SYSTEM'),
			       count(*) FILTER (WHERE action = 'auth.login.success'),
			       count(*) FILTER (WHERE action = 'auth.login.failure')
			FROM audit_event
			WHERE occurred_at >= :since
			GROUP BY 1
			ORDER BY 1
			ON CONFLICT (bucket) DO UPDATE SET rest = EXCLUDED.rest, ai_tool = EXCLUDED.ai_tool,
			    system = EXCLUDED.system, login_success = EXCLUDED.login_success,
			    login_failure = EXCLUDED.login_failure
			WHERE (audit_activity_bucket.rest, audit_activity_bucket.ai_tool, audit_activity_bucket.system,
			       audit_activity_bucket.login_success, audit_activity_bucket.login_failure)
			      IS DISTINCT FROM (EXCLUDED.rest, EXCLUDED.ai_tool, EXCLUDED.system, EXCLUDED.login_success,
			       EXCLUDED.login_failure)
			""")
	int refreshActivityBuckets(@Param("since") Instant since);

	/**
	 * Events per local day since {@code from}, from the 15-minute buckets. {@code zone} is an IANA
	 * zone id already validated by {@link java.time.ZoneId#of}; it is bound as a parameter, never
	 * concatenated into the SQL.
	 */
	@Query(nativeQuery = true, value = """
			SELECT CAST(bucket AT TIME ZONE :zone AS date) AS day,
			       sum(rest) AS rest,
			       sum(ai_tool) AS aiTool,
			       sum(system) AS system,
			       sum(login_success) AS loginSuccess,
			       sum(login_failure) AS loginFailure
			FROM audit_activity_bucket
			WHERE bucket >= :from
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
