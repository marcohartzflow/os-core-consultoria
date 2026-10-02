-- Performance of the audit trail, part 1 (transactional). See docs/performance.md.

-- audit_event only receives inserts. Vacuum it (and refresh its statistics) after 2 % new rows
-- instead of 20 %: the visibility map stays current for index-only scans, freezing happens in
-- small steps instead of one huge anti-wraparound pass, and the planner sees recent days.
ALTER TABLE audit_event SET (autovacuum_vacuum_insert_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);

-- Trigram indexes make "contains" searches (the e-mail box of the audit screen, task titles) use an
-- index. pg_trgm is a trusted extension: the owner of the database may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Events per 15 minutes for the dashboard chart. The chart groups by local day in the viewer's time
-- zone; every zone offset is a multiple of 15 minutes, so these buckets add up to exact local days.
-- Derived data: AuditQueryService brings it up to date before reading, so it may be dropped and
-- rebuilt at any time.
CREATE TABLE audit_activity_bucket (
    bucket        TIMESTAMPTZ PRIMARY KEY,
    rest          INTEGER NOT NULL,
    ai_tool       INTEGER NOT NULL,
    system        INTEGER NOT NULL,
    login_success INTEGER NOT NULL,
    login_failure INTEGER NOT NULL
);

-- The chart shows at most 90 days; older buckets are never read.
INSERT INTO audit_activity_bucket
SELECT date_bin('15 minutes', occurred_at, TIMESTAMPTZ '2000-01-01 00:00:00+00'),
       count(*) FILTER (WHERE origin = 'REST'),
       count(*) FILTER (WHERE origin = 'AI_TOOL'),
       count(*) FILTER (WHERE origin = 'SYSTEM'),
       count(*) FILTER (WHERE action = 'auth.login.success'),
       count(*) FILTER (WHERE action = 'auth.login.failure')
FROM audit_event
WHERE occurred_at >= now() - INTERVAL '91 days'
GROUP BY 1;
