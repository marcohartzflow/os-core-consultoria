-- Audit-trail retention: deletes audit entries older than the retention period. Run by a person, by
-- hand, on purpose. NOT a Flyway migration (spring.flyway.locations is classpath:db/migration only)
-- and never run by the application: the API's role (os_app) has no UPDATE, DELETE or TRUNCATE on
-- audit_event (afterMigrate.sql) and the V10 triggers refuse them for every role, owner included.
--
-- Why: the trail is kept to meet legal obligations (LGPD art. 37; art. 16 I allows keeping it), but
-- not forever (LGPD art. 15 and 16: end of treatment once the purpose is met; OWASP ASVS 5.0 14.2.4
-- retention). The baseline default is 5 years (docs/security-baseline.md); the client's DPO or legal
-- team sets the period and how often this runs (e.g. once a month). Change only the interval in the
-- cutoff below.
--
-- How (reference deploy, from the deploy/ directory; schema owner, one transaction):
--
--   docker compose exec -T postgres psql -U os_owner -d os -v ON_ERROR_STOP=1 \
--     < ../apps/api/src/main/resources/db/retention/audit-retention.sql
--
-- What it does, all inside ONE transaction (on any error nothing is deleted and the triggers stay on):
--   1. disables the append-only triggers of V10 (audit_event_no_update_delete, audit_event_no_truncate);
--      ALTER TABLE takes a lock that makes the API's inserts wait until COMMIT, so no other session
--      ever sees the table without its triggers and no audited action is lost (it is only delayed);
--   2. deletes the entries older than the period, measured from the start of the transaction;
--   3. re-enables both triggers;
--   4. records the purge itself in the trail (action audit.retention.purged, origin SYSTEM) with the
--      cut-off and the number of rows deleted, so the trail shows that and when it was shortened.
-- Run it off-peak: on a large trail the delete is long and the API's audited writes wait for it.
-- A backup taken before the purge still holds the deleted rows; expire backups on the same period.
-- audit_activity_bucket (V12) holds only counts for the last 91 days and is not touched.

BEGIN;

ALTER TABLE audit_event DISABLE TRIGGER audit_event_no_update_delete;
ALTER TABLE audit_event DISABLE TRIGGER audit_event_no_truncate;

-- The retention period: the only value to change.
WITH cutoff AS (
    SELECT now() - interval '5 years' AS at
), purged AS (
    DELETE FROM audit_event USING cutoff
    WHERE audit_event.occurred_at < cutoff.at
    RETURNING 1
)
INSERT INTO audit_event (id, occurred_at, actor_id, actor_email, origin, action, entity_type, entity_id,
                         details, ip, correlation_id)
SELECT gen_random_uuid(), clock_timestamp(), NULL, NULL, 'SYSTEM', 'audit.retention.purged', 'audit_event', NULL,
       jsonb_build_object('olderThan', cutoff.at, 'rows', (SELECT count(*) FROM purged), 'by', current_user),
       NULL, NULL
FROM cutoff;

ALTER TABLE audit_event ENABLE TRIGGER audit_event_no_update_delete;
ALTER TABLE audit_event ENABLE TRIGGER audit_event_no_truncate;

-- The row just written, for the operator's record.
SELECT occurred_at, details FROM audit_event
WHERE action = 'audit.retention.purged' ORDER BY occurred_at DESC LIMIT 1;

COMMIT;
