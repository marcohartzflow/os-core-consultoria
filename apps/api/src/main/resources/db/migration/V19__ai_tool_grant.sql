-- Permissões do assistente escolhidas pela pessoa, por ferramenta (aba Ferramentas das configurações
-- do assistente e menu "Permitir…" do cartão de confirmação). Sem linha, vale o padrão: leitura
-- roda, ação pergunta. ALLOW numa ação dispensa a confirmação; BLOCK tira a ferramenta do agente.
-- conversation_id preenchido: vale só naquela conversa e some com ela. Nulo: vale sempre, até
-- expires_at (ações) ou até a pessoa mudar. O teto por risco (@RequiresConfirmation.risk) é
-- verificado no servidor a cada uso, não só ao gravar.
CREATE TABLE ai_tool_grant (
    id              UUID PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tool_name       VARCHAR(150) NOT NULL,
    mode            VARCHAR(10)  NOT NULL,
    conversation_id UUID REFERENCES ai_conversation (id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL,
    last_used_at    TIMESTAMPTZ,
    CONSTRAINT ai_tool_grant_scope UNIQUE NULLS NOT DISTINCT (user_id, tool_name, conversation_id),
    CONSTRAINT ai_tool_grant_mode CHECK (mode IN ('ALLOW', 'BLOCK')),
    CONSTRAINT ai_tool_grant_block_everywhere CHECK (mode = 'ALLOW' OR conversation_id IS NULL)
);
CREATE INDEX ai_tool_grant_conversation_idx ON ai_tool_grant (conversation_id) WHERE conversation_id IS NOT NULL;
