-- Módulo ai: conversas, ações pendentes de confirmação e memória de chat do Spring AI.

CREATE TABLE ai_conversation (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ai_conversation_user_idx ON ai_conversation (user_id, updated_at DESC);

CREATE TABLE ai_pending_action (
    id              UUID PRIMARY KEY,
    conversation_id UUID         NOT NULL REFERENCES ai_conversation (id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tool_name       VARCHAR(150) NOT NULL,
    summary         VARCHAR(300) NOT NULL,
    arguments       TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    resolved_at     TIMESTAMPTZ,
    result          TEXT
);
CREATE INDEX ai_pending_action_conversation_idx ON ai_pending_action (conversation_id, status);

-- Spring AI 2.0.1 chat memory (JDBC). Copiado de
-- org/springframework/ai/chat/memory/repository/jdbc/schema-postgresql.sql.
-- spring.ai.chat.memory.repository.jdbc.initialize-schema=never: o schema é responsabilidade do Flyway.
CREATE TABLE SPRING_AI_CHAT_MEMORY (
    conversation_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
    "timestamp" TIMESTAMP NOT NULL,
    sequence_id BIGINT NOT NULL
);
CREATE INDEX SPRING_AI_CHAT_MEMORY_CONVERSATION_ID_TIMESTAMP_IDX
    ON SPRING_AI_CHAT_MEMORY (conversation_id, "timestamp");
CREATE INDEX SPRING_AI_CHAT_MEMORY_CONVERSATION_ID_SEQUENCE_ID_IDX
    ON SPRING_AI_CHAT_MEMORY (conversation_id, sequence_id);
