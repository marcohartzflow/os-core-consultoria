-- IAM: usuários, roles, permissões e tokens de conta.

CREATE TABLE users (
    id                    UUID PRIMARY KEY,
    email                 VARCHAR(320) NOT NULL UNIQUE,
    name                  VARCHAR(200) NOT NULL,
    password_hash         VARCHAR(255),
    status                VARCHAR(20)  NOT NULL,
    failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL,
    created_by            UUID,
    updated_at            TIMESTAMPTZ  NOT NULL,
    updated_by            UUID
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID
);

CREATE TABLE role_permissions (
    role_id    UUID         NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission VARCHAR(150) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles (id),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);

CREATE TABLE account_tokens (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       VARCHAR(20) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL,
    updated_by UUID
);
CREATE INDEX account_tokens_user_id_type_idx ON account_tokens (user_id, type);
