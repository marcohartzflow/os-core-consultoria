-- A aprovação de uma leitura vale para a chamada aprovada, não para qualquer outra da mesma
-- ferramenta: o grant de uso único guarda o SHA-256 da forma canônica dos argumentos
-- (ToolArguments.sha256) e só deixa passar a chamada com o mesmo valor.
ALTER TABLE ai_tool_grant ADD COLUMN arguments_sha256 VARCHAR(64);
-- Uso único só existe como ALLOW numa conversa e preso a argumentos.
ALTER TABLE ai_tool_grant ADD CONSTRAINT ai_tool_grant_single_use CHECK (
    NOT single_use OR (mode = 'ALLOW' AND conversation_id IS NOT NULL AND arguments_sha256 IS NOT NULL)
);
