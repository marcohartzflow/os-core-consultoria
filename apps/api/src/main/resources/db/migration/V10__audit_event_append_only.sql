-- The audit trail is append-only by construction, not by convention: no role, not even the table
-- owner, can update, delete or truncate a row through the application. Retention is a legal
-- obligation (LGPD art. 37), so anonymization keeps these rows (see AuditDataContributor).
CREATE FUNCTION audit_event_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is append-only';
END
$$;
CREATE TRIGGER audit_event_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION audit_event_is_append_only();
CREATE TRIGGER audit_event_no_truncate
    BEFORE TRUNCATE ON audit_event
    FOR EACH STATEMENT EXECUTE FUNCTION audit_event_is_append_only();

-- Sessions are indexed by the principal name (the e-mail), which the users table allows up to 320.
ALTER TABLE SPRING_SESSION ALTER COLUMN PRINCIPAL_NAME TYPE VARCHAR(320);
