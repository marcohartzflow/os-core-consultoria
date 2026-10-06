-- Storage and write cost of the big tables, for comparing schema changes (see README.md).
\pset footer off
SELECT c.relname AS relation, pg_size_pretty(pg_relation_size(c.oid)) AS size, pg_relation_size(c.oid) AS bytes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'i')
  AND (c.relname LIKE 'audit_event%' OR c.relname LIKE 'tasks%' OR c.relname LIKE 'users%' OR c.relname LIKE 'audit_activity%')
ORDER BY c.relname;
SELECT pg_size_pretty(pg_total_relation_size('audit_event')) AS audit_event_total;
-- 20 000 single-row inserts, each its own statement, as the API appends events. Variables are not
-- expanded inside DO, so the id function is passed through a setting.
SELECT set_config('perf.idfn', :'idfn', false);
\timing on
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..20000 LOOP
    EXECUTE format('INSERT INTO audit_event (id, occurred_at, actor_id, actor_email, origin, action, entity_type,
        entity_id, details, ip, correlation_id)
      VALUES (%s(), now(), NULL, $1, ''REST'', ''iam.user.renamed'', ''user'', $2, ''{"perf": true}'', ''10.0.0.1'', $3)',
      current_setting('perf.idfn'))
    USING 'carga' || (i % 500) || '@empresa1.com.br', i::text, 'perf-write-' || i;
  END LOOP;
END $$;
\timing off
