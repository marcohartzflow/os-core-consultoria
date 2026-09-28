-- Trilha de auditoria de negócio (LGPD art. 37, ASVS V16). Append-only.
-- Em produção, o role de banco usado pela aplicação recebe apenas INSERT e SELECT nesta tabela:
--   REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM <role_da_aplicacao>;

CREATE TABLE audit_event (
    id             UUID PRIMARY KEY,
    occurred_at    TIMESTAMPTZ  NOT NULL,
    actor_id       UUID,
    actor_email    VARCHAR(320),
    origin         VARCHAR(20)  NOT NULL,
    action         VARCHAR(100) NOT NULL,
    entity_type    VARCHAR(100),
    entity_id      VARCHAR(100),
    details        JSONB,
    ip             VARCHAR(64),
    correlation_id VARCHAR(100)
);
CREATE INDEX audit_event_occurred_at_idx ON audit_event (occurred_at DESC);
CREATE INDEX audit_event_actor_id_idx ON audit_event (actor_id);
CREATE INDEX audit_event_entity_idx ON audit_event (entity_type, entity_id);
