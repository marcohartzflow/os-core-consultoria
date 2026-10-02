-- Passkeys (WebAuthn) as a second factor. user_entities and user_credentials are Spring Security's
-- own schema for JdbcPublicKeyCredentialUserEntityRepository and JdbcUserCredentialRepository
-- (spring-security web/src/main/resources/org/springframework/security/user-entities-schema.sql and
-- user-credentials-schema-postgres.sql, 7.1.x), with one change: user_entities.name holds the login
-- e-mail, which may have up to 320 characters (100 upstream).
CREATE TABLE user_entities (
    id           VARCHAR(1000) NOT NULL,
    name         VARCHAR(320)  NOT NULL,
    display_name VARCHAR(200),
    PRIMARY KEY (id)
);

CREATE TABLE user_credentials (
    credential_id                VARCHAR(1000) NOT NULL,
    user_entity_user_id          VARCHAR(1000) NOT NULL,
    public_key                   BYTEA         NOT NULL,
    signature_count              BIGINT,
    uv_initialized               BOOLEAN,
    backup_eligible              BOOLEAN       NOT NULL,
    authenticator_transports     VARCHAR(1000),
    public_key_credential_type   VARCHAR(100),
    backup_state                 BOOLEAN       NOT NULL,
    attestation_object           BYTEA,
    attestation_client_data_json BYTEA,
    created                      TIMESTAMP,
    last_used                    TIMESTAMP,
    label                        VARCHAR(1000) NOT NULL,
    PRIMARY KEY (credential_id)
);

-- Which account owns each passkey, so listings, filters and the LGPD export see passkeys next to
-- the authenticator app. Removing the credential or the account removes the link.
CREATE TABLE user_passkey (
    credential_id VARCHAR(1000) PRIMARY KEY REFERENCES user_credentials (credential_id) ON DELETE CASCADE,
    user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ   NOT NULL
);
CREATE INDEX user_passkey_user_id_idx ON user_passkey (user_id);
