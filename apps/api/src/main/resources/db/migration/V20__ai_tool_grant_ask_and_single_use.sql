-- "Pedir aprovação" também para leituras (mode ASK, só como escolha geral) e a permissão de uso
-- único que a aprovação de uma leitura cria: o assistente refaz a consulta e ela roda uma vez.
ALTER TABLE ai_tool_grant DROP CONSTRAINT ai_tool_grant_mode;
ALTER TABLE ai_tool_grant ADD CONSTRAINT ai_tool_grant_mode CHECK (mode IN ('ALLOW', 'ASK', 'BLOCK'));
ALTER TABLE ai_tool_grant ADD COLUMN single_use BOOLEAN NOT NULL DEFAULT FALSE;
