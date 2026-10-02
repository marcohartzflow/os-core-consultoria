-- Flyway callback (not a versioned migration): runs after every successful migrate, also when
-- nothing was pending, so the privileges below are re-applied on each deploy and after a restore.
-- https://documentation.red-gate.com/flyway/reference/callback-events
--
-- The reference deploy (deploy/postgres-roles.sh) migrates as os_owner, which owns every table, and
-- runs the API as os_app, which owns nothing. Development and tests have a single user and no
-- os_app role: there this callback does nothing.
--
-- What os_app may do, by table:
--   audit_event                          SELECT, INSERT (append-only, LGPD art. 37; triggers in V10)
--   audit_activity_bucket                SELECT, INSERT, UPDATE (INSERT ... ON CONFLICT DO UPDATE)
--   spring_ai_chat_memory                SELECT, INSERT, DELETE (Spring AI rewrites a conversation)
--   flyway_schema_history                nothing
--   every other table (sessions, event publication registry, iam, ai, tasks and new modules)
--                                        SELECT, INSERT, UPDATE, DELETE
-- TRUNCATE, REFERENCES and TRIGGER are never granted, and the schema gives no CREATE (PostgreSQL 15+
-- revoked it from PUBLIC). A new table that must not take updates or deletes revokes them here.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'os_app')
       OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'os_owner') THEN
        RETURN;
    END IF;

    GRANT USAGE ON SCHEMA public TO os_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO os_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO os_app;
    -- Same privileges for tables a later migration creates, from the moment it creates them.
    ALTER DEFAULT PRIVILEGES FOR ROLE os_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO os_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE os_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO os_app;

    REVOKE ALL ON ${flyway:table} FROM os_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM os_app;
    REVOKE DELETE ON audit_activity_bucket FROM os_app;
    REVOKE UPDATE ON spring_ai_chat_memory FROM os_app;
END
$$;
