-- Segundo fator (TOTP, RFC 6238) e códigos de recuperação.
-- secret é o segredo TOTP cifrado com AES-GCM (chave em OS_MFA_ENCRYPTION_KEY); nunca em claro.

CREATE TABLE user_mfa (
    user_id        UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret         TEXT        NOT NULL,
    enabled_at     TIMESTAMPTZ,
    last_used_step BIGINT,
    created_at     TIMESTAMPTZ NOT NULL,
    created_by     UUID,
    updated_at     TIMESTAMPTZ NOT NULL,
    updated_by     UUID
);

CREATE TABLE user_mfa_recovery_code (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  VARCHAR(64) NOT NULL UNIQUE,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX user_mfa_recovery_code_user_id_idx ON user_mfa_recovery_code (user_id);
