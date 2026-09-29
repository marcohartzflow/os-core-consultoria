# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões seguem SemVer. A seção "Ação necessária no fork" diz o que um fork de cliente precisa fazer ao trazer a versão.

## [Unreleased]

### Adicionado

- Base do OS Core: monorepo (Spring Boot 4.1 + Next.js 16), módulos `common`, `auth`, `iam`, `ai` e o exemplo `tasks`.
- Sessão no servidor (Spring Session JDBC), CSRF, Argon2id, lockout, rate limit por IP, limite de sessões simultâneas, revogação imediata.
- Convite por e-mail, redefinição de senha, roles, catálogo de permissões gerado das anotações, guardas contra escalação de privilégio e remoção do último administrador.
- Troca de senha obrigatória para o administrador criado pelo bootstrap.
- Agente de IA com tools filtradas por permissão, confirmação humana para ações destrutivas, auditoria de cada chamada e streaming token a token.
- Trilha de auditoria consultável e exportável em CSV.
- Direitos do titular (LGPD art. 18): exportação dos próprios dados e anonimização de conta desativada.
- Envio de e-mail por SMTP quando configurado.
- Segundo fator (TOTP + códigos de recuperação), obrigatório para administradores.
- Tipos TypeScript gerados do OpenAPI (`packages/contracts`), verificados no CI.
- Ações de UI emitidas por tools (`navigate`), mostradas e executadas no painel do assistente.
- Deploy de referência com Docker Compose e Caddy, backup, CI com build das imagens, CD por SSH para forks.
- Layout do portal no estilo do template next-shadcn-admin-dashboard: sidebar recolhível em ícones, busca de telas (⌘J), tema claro/escuro/sistema, painel com indicadores e atividade recente, listas em cards com busca e filtro, login em duas colunas, página 404.

### Alterado

- Permissões reservadas ao administrador do sistema: criar, editar e excluir roles, atribuir roles (`iam.user.roles.assign`, nova), redefinir o segundo fator de outra pessoa e anonimizar. Não entram em outras roles e não viram tools de IA (`iam_anonymize_user` foi removida).
- `iam.user.update` só renomeia (`PATCH /api/iam/users/{id}`, corpo `{name}`); roles vão por `PUT /api/iam/users/{id}/roles`. Convite com roles exige `iam.user.roles.assign`.
- Pelo menos 2 administradores ativos (`os.iam.administrators.minimum`); conceder a role de sistema pede a senha de quem concede e avisa os demais administradores por e-mail.

### Segurança

Revisão completa de 2026-09-29 (três frentes: auth/iam, agente de IA, web/deploy). Corrigido:

- Login dentro de uma sessão já verificada pelo segundo fator herdava a verificação; agora todo login começa uma sessão nova.
- Reenvio de convite, edição, desativação, reativação, anonimização e reset do segundo fator exigem que o ator tenha todas as permissões do alvo (`GrantGuard.assertCanManage`).
- Confirmação de ação destrutiva do assistente é reivindicada atomicamente (`PENDING` para `EXECUTING`): duas confirmações concorrentes executam uma vez; expiração é registrada e auditada.
- Resultado de tool nunca entra no prompt de sistema; o desfecho vira nota fixa no papel de usuário, oculta na tela e na exportação.
- Falhas de código MFA contam no lockout da conta e são auditadas (`iam.mfa.failed`).
- `audit_event` é append-only por trigger (`V10`), para qualquer role.
- Link de convite só é devolvido ao administrador quando não há entrega por e-mail.
- Eventos de domínio carregam só o id do usuário (o arquivo de eventos guardava e-mail após anonimização).
- Turno do assistente cancela ao desconectar ou por timeout (`os.ai.turn-timeout`); limite de turnos simultâneos por pessoa (`os.ai.max-concurrent-turns-per-user`).
- Tokens de convite e reset, códigos de recuperação e passos TOTP são de uso único decidido no banco; códigos de recuperação com HMAC sob a chave de MFA; troca de senha apaga tokens de reset pendentes.
- Verificação de senha vazada indisponível recusa a senha com mensagem clara (fail-closed); e-mail de reset sai fora da requisição.
- `UiAction.Navigate` só aceita caminho absoluto simples; rate limiter por /64 em IPv6, poda limitada, sem perder hits.
- Web reage a 401 e aos 403 de gate em qualquer chamada; tela de conta não dispara chamadas bloqueadas pelo gate.
- Limite de sessões simultâneas não era aplicado (a sessão mais antiga só era marcada como expirada); agora a mais antiga recebe 401.
- Com `SPRING_MAIL_HOST` vazio (caso do Compose sem SMTP) o notificador de e-mail era ativado sem servidor e os links de convite não chegavam a ninguém; agora vale o repasse ao administrador.
- Editar ou excluir uma role exige ter todas as permissões dela. Cada tool call do assistente usa as permissões atuais da pessoa (revogação no meio do turno vale na próxima chamada). Hash bcrypt legado vira Argon2id no próximo login.
- Imagens base fixadas por digest; segredos de produção como arquivos (Compose secrets + config tree), fora do ambiente.
- CD com host key fixada, imagens construídas no CI e publicadas no registry (`update.sh <tag>`, rollback pela tag anterior); Compose sem capabilities, sem ganho de privilégio, read-only, limites de memória e processos; Caddy com limite de corpo; backup criptografado com `age` e `restore.sh`.

### Ação necessária no fork

- Primeira versão; nada a migrar.
- A migração `V11` tira das roles personalizadas as permissões que passaram a ser reservadas (registrado na auditoria). Quem dependia delas passa a pedir ao administrador. Cliente de API que usava `PATCH /api/iam/users/{id}` com `roleIds` passa a usar `PUT /api/iam/users/{id}/roles`. Tenha dois administradores ativos.
- Deploy: defina `DEPLOY_HOST_KEY` e `OS_IMAGE_REPOSITORY`; gere um par de chaves `age` para o backup (`BACKUP_AGE_RECIPIENT`); em produção `OS_APP_BASE_URL` passa a ser obrigatório (o Compose já o define a partir de `OS_DOMAIN`).
- Segredos saem do `.env`: rode `deploy/init-secrets.sh` e mova para `deploy/secrets/` os valores de `POSTGRES_PASSWORD` (`db_password`), `ANTHROPIC_API_KEY` (`anthropic_api_key`), `OS_MFA_ENCRYPTION_KEY` (`mfa_encryption_key`) e `SPRING_MAIL_PASSWORD` (`mail_password`), sobrescrevendo os gerados se a instância já existia.
