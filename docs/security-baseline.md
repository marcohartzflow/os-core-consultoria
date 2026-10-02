# Baseline de segurança, auditoria e LGPD

Os dados tratados pelos sistemas derivados do `os-core` são confidenciais. Este documento define o mínimo obrigatório para todo fork. Nas tabelas, o status **fase N** indica a fase em que o item foi entregue no `os-core`, e **feito** marca o que foi entregue ou refeito nas revisões. O que é obrigação do fork, e não existe no core, está dito no próprio texto.

Referências: OWASP ASVS 5.0 (V3, V6, V7, V8, V11, V13, V16), NIST SP 800-63B-4 (AAL2), OWASP Cheat Sheets, OWASP Top 10 for LLM Applications 2025, LGPD (Lei 13.709/2018), Guia da ANPD para agentes de tratamento de pequeno porte.

## 1. Autenticação e sessão (ASVS V7)

| Requisito | Decisão | Status |
|---|---|---|
| Token de sessão gerado no backend com CSPRNG e no mínimo 128 bits (7.2.1, 7.2.3, 11.5.1) | 256 bits de `SecureRandom` em Base64url (`SessionIds`, instalado no repositório JDBC do Spring Session). O padrão do Spring Session é um UUID, com 122 bits aleatórios, e o ASVS diz que UUID não serve. Não aceitamos id vindo do cliente | feito |
| Novo token ao autenticar, invalidando o anterior (7.2.4) | O login invalida a sessão anterior e cria uma nova (`AuthController`). O id muda de novo quando o segundo fator é aceito (`ChangeSessionIdAuthenticationStrategy` em `SessionSecondFactorGrant`) e a cada reautenticação: a senha digitada de novo para confirmar uma mudança, quando confere, troca o id da sessão (`LoginAttempts.confirmPassword`, `changeSessionId` do Spring Session; o ASVS 7.2.4 inclui "re-authentication"). Os atributos da sessão continuam; o token CSRF não depende do id e continua valendo | feito |
| Invalidação no servidor no logout (7.4.1) | Logout invalida a sessão no Postgres, apaga o cookie e envia `Clear-Site-Data: "cache", "cookies", "storage"` (o que o portal guarda no navegador não fica para a próxima pessoa) | fase 2 |
| Encerrar todas as sessões ao desativar ou excluir usuário (7.4.2) | `SessionRegistry` + `FindByIndexNameSessionRepository` do Spring Session JDBC: desativar usuário chama `deleteById` em todas as sessões dele | fase 2 |
| Sessão de conta que perdeu a senha (7.4.1, 7.4.3) | A cada requisição o principal é relido (`RefreshingSecurityContextRepository`): conta que não está ativa ou que não tem mais senha (o administrador redefiniu o segundo fator, o que invalida a senha) perde o contexto na hora, sem esperar o listener que apaga as sessões | feito |
| Timeout de inatividade e tempo máximo absoluto (7.1.1, 7.3.1, 7.3.2) | Inatividade 30 min (`spring.session.timeout`). Absoluto 12 h (`os.auth.session.absolute-timeout`): `AbsoluteSessionTimeoutFilter` compara a hora de criação da sessão (`getCreationTime()`) com o limite; ao estourar, invalida e exige novo login | fase 2 |
| Limite de sessões simultâneas documentado (7.1.2) | 3 por pessoa (`os.auth.session.max-concurrent`), a mais antiga é encerrada. Só contam logins completos (`CompleteLoginSessionRegistry`), e o limite roda quando o segundo fator é aceito (`SessionSecondFactorGrant`): quem sabe só a senha não derruba as sessões verificadas | feito |
| Encerrar outras sessões após troca de senha (7.4.3) | Ao trocar a senha (`POST /api/me/password`), todas as outras sessões da pessoa são apagadas e a atual ganha id novo. Redefinir pelo link encerra todas | feito |
| Reautenticação completa antes de alterar atributos que afetam a autenticação (7.5.1) | Numa conta com segundo fator: um segundo fator dos últimos 15 min (regra `reauthenticated` do `SecurityConfig`) mais a senha atual no corpo, nos endpoints que a pedem. Antes de a conta ter o primeiro fator, a senha atual. O core não tem troca do e-mail de acesso; o e-mail secundário para avisos (`PUT /api/me/notification-email`) segue esta regra. Lista dos endpoints na linha "Reautenticação" abaixo | feito |
| Usuário vê e encerra suas sessões depois de se autenticar de novo; admin encerra sessões de outro usuário (7.4.5, 7.5.2) | `GET /api/me/sessions`; `DELETE /api/me/sessions` e `DELETE /api/me/sessions/{id}` exigem um segundo fator dos últimos 15 min (sem senha no corpo). `DELETE /api/iam/users/{id}/sessions` exige poder gerenciar a pessoa. Numa conta sem segundo fator (só com `require-for-all: false`) encerrar sessões não pede nada além da sessão: 7.5.2 não é atendido nesse caso (seção 9) | feito |
| Cookie `HttpOnly`, `Secure`, `SameSite`, sem `Domain`, prefixo `__Host-` (3.3.1, 3.3.3) | `__Host-OS_SESSION`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain`. O prefixo faz o navegador recusar o cookie sem esses atributos, então um subdomínio vizinho não o grava. Só em desenvolvimento sem HTTPS (`os.auth.session.cookie-secure: false`) o nome fica `OS_SESSION`, sem `Secure` (`SecurityConfig.sessionCookie`) | feito |
| CSRF | `csrf.spa()` do Spring Security: cookie `__Host-XSRF-TOKEN` (`XSRF-TOKEN` sem HTTPS, `SecurityConfig.csrfCookie`) + header `X-XSRF-TOKEN`, com proteção BREACH. Token novo no login e depois do segundo fator | feito |
| Armazenamento de senha | Argon2id via `Argon2PasswordEncoder` (mínimo OWASP: 19 MiB, 2 iterações, paralelismo 1; sal de 16 bytes, hash de 32) dentro de `DelegatingPasswordEncoder` | fase 2 |
| Senha vazada | `HaveIBeenPwnedRestApiPasswordChecker` (k-anonymity, só 5 caracteres do hash saem do servidor) no cadastro e troca de senha | fase 2 |
| Força bruta | Por IP: `RateLimitFilter` (seção 8, revisão 2026-09-28). Por conta: lockout no modelo do Keycloak (`User.recordLoginFailure`, `os.iam.lockout.*`). A cada 5 falhas seguidas a conta bloqueia 15 min a mais que da vez anterior, até 6 h; o contador só zera depois de um login completo, da redefinição da senha, da reativação pela administração ou de 12 h sem falha; 100 falhas seguidas bloqueiam até a redefinição da senha ou até um administrador reativar a conta (teto do NIST). Tentativas durante o bloqueio não contam nem o estendem. Senha errada no login, código errado do aplicativo autenticador, passkey recusada e senha errada para confirmar uma mudança contam no mesmo contador (`LoginAttempts`), como no Keycloak. Bloqueio vai para o log `SECURITY` e para a trilha (`iam.user.locked`) | feito |
| Registro | Não existe registro público. Convite por e-mail com token de uso único, expira em 48 h, hash do token no banco. O e-mail sai depois do commit, com o token já gravado, e é reenviado se o SMTP falhar (`AccountLinkMailer`, registro de publicações do Spring Modulith). Produção não sobe sem SMTP (`ProductionMailCheck`): aceitar o convite é o que prova que o e-mail é da pessoa | feito |
| Política de senha | Tamanho em caracteres Unicode (code points), mínimo 12 e máximo 128 (`os.iam.password.*`). Os campos de senha da API e do portal aceitam até 512 unidades UTF-16 (4 × 128, o que um code point pode ocupar), para que o limite que vale seja o da política, contado em code points; recusa senha que contenha o nome do portal, o e-mail ou a parte do e-mail antes do @ (partes com menos de 4 caracteres são ignoradas); recusa senha vazada e, se a verificação estiver fora do ar, recusa qualquer senha até ela voltar (`PasswordPolicy`) | feito |
| MFA (6.3.3) | Obrigatório para todos (`os.iam.mfa.require-for-all: true`). Desligar só vale com `os.iam.password.min-length` 15 ou mais (NIST, senha como fator único); a aplicação não sobe de outro jeito (`IamProperties`). Fatores: aplicativo autenticador (TOTP) e passkey (WebAuthn). Detalhes em "Segundo fator" na seção 8 | feito |
| Reautenticação | Com segundo fator na conta, exigem um segundo fator dos últimos 15 min: `POST /api/me/mfa/setup`, `/confirm`, `/disable`, `/recovery-codes`, `POST /api/me/passkeys/options`, `POST /api/me/passkeys`, `DELETE /api/me/passkeys/{id}`, `POST /api/me/password`, `PUT /api/me/notification-email`, `DELETE /api/me/sessions` e `/{id}`. Pedem também a senha atual no corpo: configurar o aplicativo, desativá-lo, gerar códigos, opções de passkey, remover passkey, trocar a senha e o e-mail secundário. Desativar o aplicativo não pede código: o fator recente da sessão já o prova. Cadastrar mais um fator não renova o fator da sessão; só o primeiro fator da conta vale como passado (`MfaService.FactorAdded.firstFactor`). Conceder a role de sistema pede a senha de quem concede. Senha errada conta no lockout (`LoginAttempts`); conta bloqueada não confirma nada. Redefinir o segundo fator de outra pessoa exige o próprio segundo fator dos últimos 15 min. Recusa por fator vencido: 403 `urn:os:problem:mfa-reverification-required`, e o portal abre a reconfirmação e repete a ação (`useStepUp`) | feito |

## 2. Autorização (ASVS V8)

| Requisito | Decisão | Status |
|---|---|---|
| Regras de autorização documentadas (8.1.1) | Catálogo de permissões `modulo.recurso.acao` gerado a partir das anotações `@RequiresPermission` e exposto em `GET /api/iam/permissions` | fase 2 |
| Acesso por função restrito a permissão explícita (8.2.1) | `@RequiresPermission` no use case; método sem anotação em pacote `application` falha em teste de arquitetura | fase 2 |
| Acesso por dado restrito (IDOR/BOLA) (8.2.2) | Use case recebe o usuário atual e filtra por dono ou escopo; nunca confia em id do cliente | fase 2 em diante, por módulo |
| Enforcement em camada confiável (8.3.1) | Sempre no backend. O front só esconde o que o usuário não pode ver | fase 1 |
| Acesso por campo (8.2.3) | DTOs de saída específicos por caso de uso; nada de expor entidade JPA | fase 2 |
| Deny by default | `authorizeHttpRequests` termina com `anyRequest().authenticated()`, que pelo `AuthorizationManagerFactory` também exige o segundo fator. Sem sessão: `POST /api/auth/login`, `GET /api/auth/csrf`, `POST /api/iam/invitations/accept`, `POST /api/iam/password-reset/request`, `POST /api/iam/password-reset/confirm`, `GET /actuator/health`. Com senha e ainda sem segundo fator: ver "Segundo fator" na seção 8 | feito |
| Funções administrativas protegidas (8.2, NIST 800-53 AC-6) | Permissões reservadas (`@RequiresPermission(reserved = true)`): `iam.role.create`, `iam.role.update`, `iam.role.delete`, `iam.user.roles.assign`, `iam.user.mfa.reset`, `iam.user.anonymize`. Só a role de sistema as tem; nenhuma outra role as recebe (422) e nenhuma tool de IA pode exigi-las (o boot recusa). Convidar, renomear e desativar continuam delegáveis, sem dar acesso | feito |
| Segregação de funções (NIST AC-5) | Leitura e exportação da trilha de auditoria são delegáveis a quem não é administrador (auditoria, encarregado de dados), para que os atos dos administradores sejam vistos por outra pessoa | feito |
| Conta de administrador | Pelo menos `os.iam.administrators.minimum` (padrão 2) administradores ativos: remover ou desativar abaixo disso é recusado e a tela de usuários avisa. Conceder a role de sistema exige a senha de quem concede e avisa por e-mail os demais administradores. Segundo fator obrigatório (para todos, e para a role de sistema mesmo se `require-for-all` for desligado) | feito |

## 3. Headers, transporte e erros

- HSTS com `includeSubDomains` e `max-age` de 1 ano em todos os perfis, enviado nas respostas a requisições seguras (HTTPS; atrás do proxy, as que chegam com `X-Forwarded-Proto: https`), como o Spring Security faz por padrão (`SecurityConfig`); TLS terminado no proxy reverso (Caddy no deploy de referência), `forward-headers-strategy=native`: o Tomcat só confia em `X-Forwarded-*` vindo de faixas privadas e loopback (padrão do Spring Boot), o que inclui o container web. IP do cliente (ASVS 15.3.4): o Caddy não confia em nenhum proxy por padrão e repassa um único endereço no `X-Forwarded-For` (`{client_ip}`); um balanceador na frente entra em `OS_TRUSTED_PROXIES` (`trusted_proxies` com `trusted_proxies_strict`: o primeiro endereço não confiável da direita para a esquerda é o cliente) (`docs/deploy.md`, "Como o tráfego flui"). O Caddy recusa `TRACE` e `TRACK` com 405 (ASVS 13.4.4).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` restritiva, `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Resource-Policy: same-site` (`apps/web/next.config.ts`). A API responde com `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (`SecurityConfig`).
- Content-Security-Policy no Next com nonce por requisição (`apps/web/src/proxy.ts`). `script-src` só com nonce e `strict-dynamic`, sem `unsafe-inline`; `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`. `style-src` tem `'unsafe-inline'`: desvio aceito (seção 9).
- Erros retornam Problem Details (RFC 9457) sem stack trace, sem mensagem interna, sem detalhe de binding (`server.error.include-*` desligados).
- Actuator expõe só `health`, sem detalhes.
- Swagger UI desligado por padrão e sempre desligado em `prod`; `api-docs` desligado em `prod`.

## 4. Logging e auditoria (ASVS V16, LGPD art. 37)

Dois trilhos separados:

**Log técnico de segurança** (logger `SECURITY`, no stdout do container):

- Formato: no perfil `prod`, uma linha JSON por evento no formato ECS (structured logging do Spring Boot, `logging.structured.format.console: ecs` em `application-prod.yml`). O codificador JSON escapa quebras de linha e caracteres de controle, então texto vindo da requisição não forja linha (16.4.1); dado de entrada também passa por `Sanitize.forLog`.
- Contexto (16.2.1): `RequestLoggingContextFilter` põe no MDC `http.request.id` (gerado no servidor, nunca vindo do cliente) e `client.ip` (o endereço do cliente depois do proxy confiável), e o JSON grava os dois em toda linha da requisição. O mesmo id volta no cabeçalho `X-Request-Id` e é o `correlationId` das linhas da trilha gravadas por requisição REST, então uma linha da trilha leva às linhas de log. O turno do assistente roda em outra thread: o `AiController` captura na thread da requisição o MDC, o IP e o id da requisição e os restabelece na thread do turno e em cada tool call (`ContextPropagatingToolCallback`). As linhas de log do turno e das tools levam `http.request.id` e `client.ip`; as linhas da trilha do turno (`ai.turn.started`, `ai.turn.ended`) saem com origem `REST`, o IP da pessoa e o id da requisição como `correlationId`, e as das tools com origem `AI_TOOL`, o IP e o id da conversa (o que ainda fica sem contexto, na seção 9).
- O que entra: login com sucesso e falha, logout, lockout, falha de senha ao confirmar uma mudança, código e passkey recusados (no login e no cadastro), código de recuperação usado, sessões encerradas, limite de taxa excedido, concessão da role de sistema, tentativa de escalação de privilégio, falha e negação de tool de IA.
- Toda negação de autorização (16.3.2): método, URI, a regra que negou (`Denials`: a expressão ou as authorities exigidas) e a pessoa; as recusas por segundo fator ausente ou vencido também (`ProblemDetailSecurityHandlers`). O IP vem do MDC.
- A pessoa aparece pelo id ou pelo e-mail mascarado (`Sanitize.maskEmail`), nunca pelo e-mail inteiro. O IP do cliente é gravado (é o que permite investigar).
- Rotação local pelo driver `json-file` do Docker (50 MB × 5 por container). Enviar os logs para outro sistema (16.4.3) depende da infraestrutura do cliente: `docs/deploy.md`, "Logs", e seção 9.

**Trilha de auditoria de negócio** (tabela `audit_event`, append-only, em `common`):

- Quem, quando, qual ação, sobre qual entidade, valores antes e depois quando aplicável, origem (REST ou tool de IA, com id da conversa).
- Escrita pelo próprio use case ou por listener de evento de domínio, dentro da mesma transação.
- Sem `UPDATE`, `DELETE` nem `TRUNCATE` na tabela, em duas camadas. Triggers no banco (`V10`) recusam para qualquer role. E no deploy de referência a API usa um role que não é dono de nada e só tem `SELECT` e `INSERT` na tabela (ver "Mínimo privilégio" na seção 5), então quem obtiver as credenciais da API também não altera a trilha nem desliga os triggers.
- Retenção definida pelo cliente, padrão 5 anos. A aplicação nunca apaga a trilha. `db/retention/audit-retention.sql` é rodado à mão pelo dono do schema (`os_owner`): numa só transação desliga os triggers da `V10`, apaga o que passou do período, religa os triggers e registra a própria limpeza (`audit.retention.purged`, origem `SYSTEM`). Período e frequência são decisão do encarregado (DPO) do cliente.

Toda tool call do agente de IA gera entrada na trilha, com sucesso ou erro (ver `ai-agent.md`).

## 5. Dados confidenciais

- Criptografia em trânsito obrigatória (TLS 1.2+). Em repouso: acesso ao servidor só por chave SSH de quem administra, roles do banco, cifra na aplicação (abaixo) e backup criptografado com `age` (`deploy/backup.sh`), chave privada fora do servidor. Disco criptografado pelo provedor quando ele oferece; não é exigido (seção 9 e `docs/deploy.md`, "Dados em repouso"). Algoritmos e parâmetros: "Inventário criptográfico", abaixo.
- Campos de alta sensibilidade (documento, dados bancários, saúde, o que o cliente classificar) devem receber criptografia em nível de aplicação com AES-256-GCM via `AttributeConverter` do JPA, com a chave fora do banco e do repositório e um id de chave gravado junto ao dado para permitir rotação. O core não tem campo assim nem esse converter: é obrigação do módulo do fork que guardar o dado. O único dado cifrado pelo core é o segredo TOTP (`MfaService`, AES-GCM com `os.iam.mfa.encryption-key`, sem id de chave nem rotação).
- Segredos (chave da Anthropic, senhas dos três roles do banco, senha inicial do administrador, chave de MFA, senha do SMTP) nunca no repositório nem em variável de ambiente em produção: arquivos em `deploy/secrets/` criados por `deploy/init-secrets.sh`, montados como secrets do Compose e lidos pela API via config tree do Spring Boot. Em desenvolvimento, `application-local.yml`. `.env`, `*.pem`, `*.key` e `application-local.yml` estão no `.gitignore`.
- Permissão dos segredos: diretório `0700`, arquivos `0644`. O Compose monta secrets de arquivo como bind mount e ignora `uid`, `gid` e `mode`; quem lê não é o dono dos arquivos (o `postgres` com uid 999, a API e o `migrate` com uid 1001), então `0600` impediria a leitura. Quem barra os outros usuários do host é o diretório; dentro de cada container só roda o próprio usuário. Um cofre de segredos (13.3.1) é infraestrutura do cliente (seção 9).
- Mínimo privilégio no banco (deploy de referência). Três roles, criados por `deploy/postgres-roles.sh` quando o volume do Postgres está vazio. O script também revoga de `PUBLIC` o `CONNECT` e o `TEMPORARY` no banco `os` e o `CONNECT` em `postgres` e `template1`; só `os_owner` e `os_app` conectam ao `os`, e só o superusuário aos outros:
  - `postgres`: superusuário da imagem, só administração.
  - `os_owner`: dono do banco `os` e de tudo que as migrations criam. Só o serviço `migrate` do `deploy/compose.yaml` (Flyway, perfil `migrate`, roda e sai) tem a senha dele.
  - `os_app`: a API, com `SPRING_FLYWAY_ENABLED=false`. Não é dono de nada. Os privilégios vêm do callback do Flyway `db/migration/afterMigrate.sql`, aplicado depois de cada migrate: `SELECT`/`INSERT` em `audit_event`; `SELECT`/`INSERT`/`UPDATE` em `audit_activity_bucket`; `SELECT`/`INSERT`/`DELETE` em `spring_ai_chat_memory`; nada em `flyway_schema_history`; `SELECT`/`INSERT`/`UPDATE`/`DELETE` nas demais tabelas. `TRUNCATE`, `REFERENCES` e `TRIGGER` nunca são concedidos, e o schema não dá `CREATE`.
  - Conferido por `DatabaseRolesTests` (Testcontainers), que roda o `postgres-roles.sh` de verdade e as migrações num PostgreSQL 18: com as credenciais de `os_app` não dá para fazer `UPDATE`, `DELETE` ou `TRUNCATE` em `audit_event`, desligar os triggers, usar `session_replication_role`, criar tabelas (nem temporárias), ler `flyway_schema_history` nem conectar ao banco `postgres`.
  - Em desenvolvimento e nos testes há um só usuário e o callback não faz nada.
- Isolamento do deploy de referência (`deploy/compose.yaml`):
  - Redes separadas: o Postgres só é alcançado pelo `migrate` e pela API; as redes `frontend`, `app` e `database` são `internal`, então web e Postgres não saem para a internet; só a API (Anthropic, Have I Been Pwned, SMTP) e o Caddy (Let's Encrypt) têm saída; só o Caddy publica portas.
  - Todo serviço remove todas as capabilities e devolve só as que precisa: Postgres `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID` e `SETUID` (o entrypoint troca de usuário e acerta o dono do volume), Caddy `NET_BIND_SERVICE`, os demais nenhuma; `no-new-privileges`, limites de memória e processos e sistema de arquivos raiz somente leitura em todos (OWASP Docker Security Cheat Sheet, regra 8; o Postgres grava só no volume e nos `tmpfs` `/tmp` e `/run/postgresql`). `migrate`, API, web e Caddy sem root; o Caddy roda com uid 10001.
  - Um firewall de saída no host, limitando a API aos destinos acima, é infraestrutura do cliente (seção 9).
- Backups diários, retidos conforme contrato; restauração documentada (`docs/deploy.md`). `backup.sh` grava com nome temporário e só renomeia quando o dump inteiro deu certo; `restore.sh` descriptografa e descompacta para um arquivo temporário privado e só carrega se nenhum passo falhou e o arquivo termina com a linha final do `pg_dump` (um backup truncado é recusado antes de tocar no banco), numa só transação com `ON_ERROR_STOP`, então uma restauração com erro deixa o banco vazio, nunca pela metade; `update.sh` faz backup antes de atualizar, salvo na primeira instalação (Postgres parado). Depois de restaurar, as anonimizações (LGPD) feitas depois da data do backup precisam ser refeitas: o backup traz as pessoas como estavam.

### Inventário criptográfico

| Uso | Algoritmo e parâmetros | Onde |
|---|---|---|
| Senhas e códigos de recuperação | Argon2id, sal de 16 bytes, hash de 32 bytes, 19 MiB, 2 iterações, paralelismo 1 | `SecurityConfig` (`Argon2PasswordEncoder` dentro de `DelegatingPasswordEncoder`) |
| Segredo TOTP em repouso | AES-256-GCM, IV aleatório de 12 bytes, chave de 32 bytes (`os.iam.mfa.encryption-key`), sem AAD (seção 9) | `MfaService` (`AesGcmBytesEncryptor`) |
| Código do aplicativo autenticador | HMAC-SHA1, 6 dígitos, passo de 30 s (RFC 6238). SHA-1 é o padrão do RFC e o que os aplicativos autenticadores aceitam; o Apêndice C do ASVS 5.0 lista HMAC com SHA-1 como legado | `Totp` |
| Id de sessão | 32 bytes de `SecureRandom`, Base64url | `SessionIds` |
| Tokens de convite e redefinição | 32 bytes de `SecureRandom`, Base64url; no banco só o SHA-256 | `AccountTokens` |
| Id de sessão mostrado em "minhas sessões" | SHA-256 do id, 16 primeiros bytes em hex (o id real não sai) | `SessionTerminator` |
| Passkeys | assinatura verificada pelo WebAuthn4J com a chave pública cadastrada | `spring-security-webauthn` |
| Senha vazada | SHA-1 com k-anonymity (protocolo do Have I Been Pwned: só 5 caracteres do hash saem) | `HaveIBeenPwnedRestApiPasswordChecker` |
| Backup | `age` com a chave pública em `BACKUP_AGE_RECIPIENT` | `deploy/backup.sh` |
| Transporte | TLS terminado no Caddy (certificado Let's Encrypt) | `deploy/Caddyfile` |

## 6. LGPD

| Artigo | Obrigação | Como o OS atende |
|---|---|---|
| Art. 6 | Finalidade, adequação, necessidade, transparência, segurança, prevenção, não discriminação, responsabilização | Coleta mínima por módulo; cada campo pessoal documentado no inventário de dados do módulo |
| Art. 7 e 11 | Base legal para cada tratamento | Inventário de dados registra a base legal por campo ou processo; dado sensível exige base do art. 11 |
| Art. 18 | Direitos do titular: acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento, revogação de consentimento | `GET /api/me/data` exporta tudo que o portal guarda sobre a pessoa (conta, passkeys, sessões, conversas com as ações propostas, tarefas criadas por ela ou atribuídas a ela, eventos da trilha); anonimização irreversível de contas desativadas; módulos de negócio implementam `PersonalDataContributor` para participar das duas operações |
| Art. 37 | Registro das operações de tratamento | Trilha de auditoria (seção 4) + inventário de dados por módulo, no formato do modelo de Registro das Operações da ANPD |
| Art. 41 | Encarregado (DPO) | Informado pelo cliente na política de privacidade da empresa; o portal não tem página própria para isso (fork pode adicionar) |
| Art. 46 | Medidas técnicas e administrativas de segurança | Este documento inteiro |
| Art. 48 | Comunicação de incidente à ANPD e aos titulares | Runbook de incidente é responsabilidade do cliente (`SECURITY.md` cobre o reporte à Maximus Flow); a trilha de auditoria e o backup fora do host viabilizam a investigação |
| Art. 15 e 16 | Término do tratamento e eliminação | Anonimização de conta desativada. Jobs agendados: `AccountTokenCleanup` apaga de hora em hora tokens de convite e redefinição usados ou vencidos; `EventPublicationCleanup` apaga por dia o arquivo de eventos do Spring Modulith com mais de 30 dias; `PendingActionCleanup` marca como `EXPIRED` a cada 5 min as ações do assistente vencidas e apaga as resolvidas depois de 90 dias (as que ainda têm nota na conversa ficam sem argumentos e sem resultado). Trilha de auditoria: `audit-retention.sql`, à mão (seção 4). Retenção das demais tabelas de negócio é decisão por módulo |

Cada módulo de negócio novo documenta no próprio `package-info.java` (e no `PersonalDataContributor` que implementa) quais campos pessoais guarda, com base legal, finalidade e retenção. Os módulos core registram: `iam` (e-mail, e-mail secundário para avisos quando a pessoa cadastra, nome, hash de senha, segredo TOTP cifrado, hashes dos códigos de recuperação, passkeys: chave pública, nome dado pela pessoa, datas de criação e último uso, e a identidade WebAuthn com e-mail e nome; base legal execução de contrato de trabalho), `audit_event` (ator e ação; obrigação legal, art. 37, retido mesmo após anonimização), `ai` (conversas com o assistente; apagadas na anonimização).

### IA e LGPD

- Dados pessoais saem do host ao serem enviados ao provedor do modelo (Anthropic): a mensagem da pessoa e o resultado das tools (por exemplo `iam_list_users` e `iam_get_user` devolvem nome e e-mail). A Anthropic é operadora nos termos da LGPD e precisa constar no inventário e no contrato com o cliente. É transferência internacional (art. 33): a base para ela é decisão contratual do cliente, não do código (seção 9).
- O system prompt e os resultados de tool enviados ao modelo devem conter só o necessário para a tarefa. Tools que retornam listas grandes devem paginar e resumir.
- Conversas com o agente ficam no Postgres do cliente (chat memory JDBC), sujeitas à mesma retenção e aos mesmos direitos do titular.

## 7. Agente de IA (OWASP Top 10 for LLM 2025)

| Risco | Mitigação |
|---|---|
| LLM01 Prompt injection | Tools são o único efeito colateral possível; filtro de tools por permissão; confirmação humana para toda tool que altera dado (`@RequiresConfirmation`); entrada de tool passa pela validação do próprio use case (`@Valid`, regras de domínio); conteúdo vindo de dados (descrições, comentários, e-mails) é tratado como dado, nunca como instrução |
| LLM02 Vazamento de informação sensível | O modelo só vê o que o usuário atual pode ver, porque cada tool roda com a autorização do usuário; sem tool "genérica" de SQL. Falha de tool chega ao modelo só como a mensagem de uma regra de negócio, "sem permissão" ou "erro interno" (`SafeToolExceptionProcessor`, `ToolFailures`), nunca SQL, nome de constraint ou texto do driver; a causa real fica na trilha e no log `SECURITY`. A pessoa vê no chat o mesmo texto, também quando uma ação confirmada falha (`PendingActionService`). `audit_search` não devolve o IP (`AuditEntryForAgent`) |
| LLM05 Tratamento inseguro da saída | Saída do modelo é texto renderizado como texto no front, nunca HTML; ações de UI vêm em estrutura tipada, não em código |
| LLM06 Agência excessiva | Catálogo de tools é o catálogo de use cases já autorizados; nada é criado só para a IA; toda `@Tool` declara `@ReadOnlyTool` ou `@RequiresConfirmation`, e o boot falha sem uma das duas (`ToolRegistry`); `@ReadOnlyTool` roda numa transação somente leitura (`ReadOnlyTransactionToolCallback`), então o Postgres recusa escrita, e uma tool de leitura com `REQUIRES_NEW` ou `NOT_SUPPORTED` impede a subida; enquanto ela roda, uma transação nova e gravável aberta pelo código que ela chama (`REQUIRES_NEW` num callee, `TransactionTemplate` próprio) é recusada (`ReadOnlyToolTransactionGuard`, `TransactionExecutionListener` do Spring). Limitação: não é visto o que não abre transação pelo gerenciador do Spring nessa thread (callee com `NOT_SUPPORTED` gravando por JDBC em autocommit, conexão tirada direto do `DataSource`, trabalho entregue a outra thread, como `@Async` ou evento assíncrono); regra para quem escreve módulo: uma tool de leitura não chama código que abre a própria transação nem que grava fora dela (`docs/ai-agent.md`, "Tools de leitura"); ação proposta e não respondida vence em 5 min (`ai.action.expired`); o cartão de confirmação mostra os argumentos exatos da chamada; `maxCallsPerTool` e `maxTotalToolCalls` no `ToolCallingManager`; `resolution.fallback` desligado |
| LLM07 Vazamento de system prompt | System prompt não contém segredo nem regra de autorização; a autorização está no backend |
| LLM10 Consumo ilimitado | Limite de tokens por resposta (`spring.ai.anthropic.chat.max-tokens`); limite de chamadas de tool por turno (`spring.ai.tools.limits.*`: 10 por tool, 30 no total); mensagem até `os.ai.max-user-message-length` caracteres (4000); turno encerrado em `os.ai.turn-timeout` (5 min) ou quando o cliente desconecta; por pessoa, até `os.ai.turns-per-minute` turnos iniciados por minuto (20, janela deslizante em memória, `RateLimiter`) e `os.ai.max-concurrent-turns-per-user` simultâneos (2), acima disso 429 com Problem Details (`AiController`); consumo registrado por turno na trilha: `ai.turn.ended` com o id da conversa, o desfecho e os tokens que o provedor informou (`promptTokens`, `completionTokens`, `totalTokens`, mais leitura e escrita de cache quando há), lidos do `Usage` da `ChatResponse` do Spring AI, somado entre as rodadas de tool. O custo em dinheiro não é calculado: sai dos tokens pela tabela de preço do contrato. Turno interrompido registra o que o provedor tinha informado até ali |

## 8. Processo

- Dependabot semanal (`.github/dependabot.yml`) para Gradle, npm, GitHub Actions e imagens Docker no `os-core`, com `cooldown` de 7 dias nas atualizações de versão (as de segurança não esperam). O fork remove o arquivo (as versões chegam pelo merge mensal) e mantém os alertas e as atualizações de segurança do Dependabot (`docs/fork.md`).
- Cadeia de deploy (`docs/deploy.md`, "Deploy contínuo"): o `cd.yml` roda o CI antes de construir e publicar; o CI audita os workflows com o `zizmor` e varre as imagens com o Grype (vulnerabilidade crítica com correção barra o build e o deploy); checkouts sem credencial persistida; deploy só termina com os serviços saudáveis (`up --wait`) e o portal respondendo de fora (`/api/health`); actions fixadas pelo SHA do commit (guia "Security hardening for GitHub Actions"); a chave SSH do CD só executa `deploy/ci-deploy.sh` (comando forçado do OpenSSH com `restrict`), que só implanta commits da `origin/main`; o token do registry vive numa configuração temporária do Docker apagada no fim; servidor preparado pelo playbook `deploy/ansible/provision.yml` (SSH só por chave e sem root, firewall, atualizações automáticas de segurança com reinício às 04:00 quando uma correção de kernel pede, relógio sincronizado, teste mensal de restauração); `/api/health` público responde só o status, com cache de 5 s; scripts de deploy e playbook passam por `shellcheck` e `ansible-lint` no CI.
- Teste de arquitetura (`ModularityTests`) e testes de segurança rodam no CI e bloqueiam merge. Entre eles: `AuthAndIamFlowTests` (401/403 em Problem Details, CSRF, login, permissão, convite, desativação imediata, lockout, troca de senha, escalação de privilégio, último admin), `MfaTests`, `PasskeyTests`, `SecondFactorRulesTests`, `UserLockoutTests`, `PasswordPolicyTests`, `SessionAndRateFiltersTests`, `ToolRegistryRulesTests`, `ToolSafeguardsTests`, `AiSafeguardsTests`, `RequestLoggingTests`, `DatabaseRolesTests` (roles do deploy num PostgreSQL 18).
- Revisão de segurança ao fim de cada fase e antes de cada entrega ao cliente, registrada abaixo. Checklist mínimo da revisão:
  1. Toda rota nova está atrás de `anyRequest().authenticated()` ou na lista pública com justificativa.
  2. Todo use case novo tem `@RequiresPermission`; controller não tem regra.
  3. Acesso a dado específico checa dono ou escopo no use case (IDOR).
  4. Quem concede permissão precisa possuí-la (`GrantGuard`); permissão que decide quem acessa o quê é reservada (`reserved = true`) e nunca vira tool de IA.
  5. Entrada validada (`@Valid`, tamanhos máximos); saída por DTO, nunca entidade.
  6. Ação relevante gera linha em `audit_event`; log de segurança sem dado pessoal cru e sem quebra de linha (`Sanitize.forLog`).
  7. Nada de segredo em log, resposta ou repositório.
  8. Endpoint sem sessão tem rate limit.
  9. Dependências sem CVE aberta.

### Revisão 2026-09-28 (fim da fase 2)

Achados e correções aplicadas no mesmo dia:

| Achado | Risco | Correção |
|---|---|---|
| Usuário com `iam.user.update` podia atribuir a role de administrador a si mesmo | Escalação de privilégio | `GrantGuard`: só se concede role ou permissão que o ator já possui. Teste `cannotGrantPermissionsYouDoNotHold` |
| Último administrador podia ser desativado ou perder a role | Perda de controle do sistema | Guard de último admin ativo em `disable` e `update`. Teste `lastActiveAdministratorCannotBeRemoved` |
| Login, reset e aceite de token sem limite por IP | Password spraying entre contas, esgotamento de CPU do Argon2, bombardeio de e-mail | `RateLimitFilter` por IP: 20 logins/min, 5 operações de recuperação/min (o mesmo limite vale para `POST /api/auth/mfa` e `POST /api/auth/mfa/passkey`). 429 em Problem Details |
| E-mail vindo do usuário ia cru para o log de segurança | Log injection | `Sanitize.forLog` em todo log com dado de entrada |
| `PATCH /users/{id}` sem `roleIds` apagava as roles | Erro operacional | `roleIds` obrigatório |
| `next` do login aceitava `//evil.com` | Open redirect | `safeInternalPath` no front |
| Páginas do Next sem CSP | XSS ampliado | CSP com nonce por requisição em `proxy.ts`, `script-src` só com nonce, páginas dinâmicas |
| OpenAPI acessível sem sessão fora de produção | Exposição da superfície da API | Exige sessão em qualquer perfil; desligado em `prod` |
| `forward-headers-strategy=framework` confiava em qualquer `X-Forwarded-*` | Spoof de esquema/host/IP se o app for alcançável sem o proxy | `native` (RemoteIpValve, só proxies internos) + instrução de firewall |
| Link de convite ia para o log de aplicação | Segredo em log enviado para fora | Logger do notifier em WARN no perfil `prod`. Sem SMTP o link volta na resposta ao admin; desde 2026-10-02 produção não sobe sem SMTP (`ProductionMailCheck`) |

### Revisão 2026-09-28 (fim da fase 3, módulo `ai`)

Controles implementados e cobertos por `AiToolsTests`:

- Boot falha se existir `@Tool` sem `@RequiresPermission`, ou (desde 2026-10-02) sem exatamente uma de `@ReadOnlyTool` e `@RequiresConfirmation` (`ToolRegistry`).
- Catálogo por usuário = tools cuja permissão está nas authorities da sessão; `spring.ai.tools.resolution.fallback` fica desligado, então nome fora da lista não resolve.
- Use case executa via proxy Spring: `@PreAuthorize` roda de novo dentro da tool.
- `@RequiresConfirmation` (antes `@Destructive`) vira `ConfirmingToolCallback`: registra `ai_pending_action` (TTL 5 min), modelo recebe `PENDING_CONFIRMATION`; execução só em `POST /api/ai/actions/{id}/confirm` pelo mesmo usuário, com autorização do use case e auditoria em transação separada (falha vira `FAILED`, nunca fica pendente).
- Toda tool call auditada (`ai.tool.executed`/`failed`) com origem `AI_TOOL` e id da conversa via `AuditContext`; auditorias do próprio use case herdam a origem. Desde 2026-10-02 a trilha guarda dos argumentos só os nomes e o SHA-256 do JSON canônico (`ToolArguments`), nunca os valores (LGPD art. 6 III, ASVS 14.2.4): a trilha fica 5 anos e `ai_pending_action`, que tem os argumentos, é apagada em 90 dias.
- Limites por turno: 10 chamadas por tool, 30 no total (`spring.ai.tools.limits.*`); mensagem do usuário até 4000 caracteres; janela de memória 40 mensagens.
- Conversas são do usuário: toda leitura filtra por `user_id`; inexistente ou alheia responde 404.
- System prompt versionado, sem segredo e sem regra de autorização; trata conteúdo de dados como dado.
- Prompt caching só do system prompt (`SYSTEM_ONLY`); catálogo de tools varia por usuário.
- SSE roda em virtual thread com `DelegatingSecurityContextRunnable`; erro para o cliente é genérico, detalhe fica no log.

Riscos aceitos nesta revisão: ver seção 9.

### Segundo fator (2026-09-28, refeito em 2026-10-02)

Política: obrigatório para todos (`os.iam.mfa.require-for-all: true`). Com `false`, continua obrigatório para a role de sistema (`require-for-system-role`) e a senha mínima precisa ser 15 ou mais, ou a aplicação não sobe.

Fatores:

- Aplicativo autenticador: TOTP (RFC 6238, HMAC-SHA1, 6 dígitos, 30 s) em `Totp`, com replay bloqueado por `last_used_step`. Só vale o código do passo atual (`Totp.WINDOW = 0`): o ASVS 6.5.5 limita a vida do código a 30 s. É um desvio documentado do RFC 6238, que recomenda aceitar um passo de atraso; o custo é recusar o código digitado na virada do passo ou com o relógio do celular adiantado ou atrasado. Segredo cifrado em repouso com AES-256-GCM; a chave é `OS_MFA_ENCRYPTION_KEY` (32 bytes) e só serve para isso. Ativar pede a senha atual; desativar pede a senha (o fator é provado pelo step-up da sessão) e só vale se a política não exigir ou se restar uma passkey.
- Passkey (WebAuthn): relying party do Spring Security (`spring-security-webauthn`, WebAuthn4J) com o schema JDBC oficial (`V16`), em `Passkeys` e `PasskeyService`. O id do relying party é o host de `os.app.base-url` e a única origem aceita é essa URL, então uma resposta assinada para outro site é recusada. Cadastrar pede a senha atual; remover pede a senha e não deixa remover o último fator que a política exige. O identificador WebAuthn da conta é aleatório, não o e-mail; o nome WebAuthn é único (`V17`).
- Códigos de recuperação: os "saved recovery codes" do NIST SP 800-63B-4, que pede "at least 64 bits from an approved random bit generator". São 10, cada um com 15 caracteres de um alfabeto de 31 sem símbolos parecidos (cerca de 74 bits, `SecureRandom`), mostrados em três grupos de cinco (`xxxxx-xxxxx-xxxxx`). Os de 10 caracteres emitidos antes (cerca de 49,5 bits) foram apagados pela `V18`. De uso único, emitidos com o primeiro fator da conta (aplicativo ou passkey) e mostrados uma vez. Valem também em conta só com passkey. Guardados com o `PasswordEncoder` (Argon2id com sal, como senhas). Gerar novos (`POST /api/me/mfa/recovery-codes`) pede a senha e um segundo fator dos últimos 15 min e substitui todos. Remover o último fator apaga os códigos. Uso de código vira auditoria (`iam.mfa.recovery_code_used`) e log `SECURITY`.
- Aviso por e-mail (NIST SP 800-63B-4, aviso de vínculo): cadastrar ou remover um fator e gerar novos códigos manda um e-mail à pessoa, depois do commit e sem link (`AccountLinkMailer.FactorChanged`, `AccountNotifier.sendSecondFactorChanged`). Quem cadastrou um fator numa sessão roubada não passa despercebido.
- Aviso de recuperação e de troca de credencial (NIST SP 800-63B-4: "account recovery SHALL cause a notification to be sent to the subscriber or their designee, as described in Sec. 4.6"): usar um código de recuperação (`MfaService.verify`), concluir a redefinição de senha pelo link (`AccountRecoveryService.confirmPasswordReset`) e trocar a senha (`UserDirectoryImpl.changePassword`) mandam um aviso sem link depois do commit (`AccountLinkMailer.SecurityNotice`, `AccountNotifier.sendSecurityNotice`).
- Dois endereços de aviso (NIST SP 800-63B-4: "CSPs SHALL support at least two notification addresses per subscriber account"): além do e-mail de acesso, a pessoa pode cadastrar um e-mail secundário (`users.notification_email`, `V18`) em Configurações > Segurança, com reautenticação completa (senha no corpo e, com segundo fator, um dos últimos 15 min). Precisa ser um e-mail válido e diferente do de acesso. Todos os avisos (fator alterado, segundo fator redefinido, recuperação, troca de senha, novo administrador) vão aos dois; links (convite, redefinição de senha) só ao e-mail de acesso. Trocar ou remover o secundário avisa o e-mail de acesso, o novo e o anterior. Entra na exportação de dados e é apagado na anonimização.

Aplicação, no modelo de multi-factor authentication do Spring Security 7 (`SecurityConfig`):

- Cada fator vira um `FactorGrantedAuthority` na autenticação da sessão: `FACTOR_PASSWORD` no login, `FACTOR_TOTP` (`SecondFactor.TOTP_AUTHORITY`) com código ou código de recuperação, `FACTOR_WEBAUTHN` com passkey. `SessionSecondFactorGrant` acrescenta o fator com a hora em que foi emitido e, nesse momento, troca o id da sessão e o token CSRF e aplica o limite de sessões simultâneas.
- O `AuthorizationManagerFactory` acrescenta a toda regra `authenticated()` a exigência de senha + TOTP ou senha + passkey (`AllRequiredFactorsAuthorizationManager.anyOf`) quando a conta tem ou precisa ter segundo fator (`SecondFactor.required`).
- Com a senha e sem o segundo fator, só respondem: `POST /api/auth/mfa`, `POST /api/auth/mfa/passkey/options`, `POST /api/auth/mfa/passkey`, `GET /api/me`, `GET /api/me/mfa` (quais fatores a conta tem, para a tela oferecer) e o logout (que roda antes da autorização).
- Cadastro: `GET /api/me/passkeys`, `POST /api/me/mfa/setup`, `POST /api/me/mfa/confirm`, `POST /api/me/passkeys/options`, `POST /api/me/passkeys` e `POST /api/me/password` respondem sem o segundo fator só enquanto a conta não tem nenhum; depois exigem como o resto.
- Step-up (`validDuration` de 15 min): `POST /api/iam/users/*/mfa/reset` sempre, e as mudanças de fator, a troca de senha e o encerramento das próprias sessões quando a conta tem segundo fator (regra `reauthenticated`, lista na linha "Reautenticação" da seção 1). `POST /api/auth/mfa` e `POST /api/auth/mfa/passkey` também servem para renovar o fator. Cadastrar mais um fator não renova o fator da sessão: só o primeiro fator da conta conta como passado (`MfaService.FactorAdded.firstFactor`).
- Recusa por fator ausente responde 403 com tipo próprio (`ProblemDetailSecurityHandlers`): `urn:os:problem:mfa-required` (conta com fator, sessão ainda sem), `urn:os:problem:mfa-enrolment-required` (conta sem fator, política exige) e `urn:os:problem:mfa-reverification-required` (sessão já passou do fator, mas há mais tempo do que a ação aceita).
- Concorrência: toda mudança de fator (configurar e confirmar o aplicativo, desativá-lo, cadastrar e remover passkey, gerar códigos, redefinição pelo administrador) trava a linha do usuário (`SELECT … FOR UPDATE`, `MfaService.lock`) antes de contar os fatores, então duas remoções em paralelo não deixam sem fator uma conta que a política exige.
- Falhas: código errado e passkey recusada contam no lockout da conta; cinco códigos errados na mesma sessão a encerram, e o contador da sessão zera quando um código ou uma passkey é aceito; `POST /api/auth/mfa` e `POST /api/auth/mfa/passkey` têm rate limit por IP (5/min). O contador da conta só zera com o login completo, não com a senha. Recusas por fator ausente ou vencido e código ou passkey recusados no cadastro vão para o log `SECURITY`.

Redefinição pelo administrador (`MfaService.reset`, permissão reservada `iam.user.mfa.reset`, nunca a própria conta): apaga aplicativo autenticador, passkeys e códigos de recuperação, invalida a senha, encerra todas as sessões e manda à pessoa um e-mail com link de redefinição de senha (`AccountLinkMailer`, depois do commit; o e-mail secundário recebe só o aviso, sem o link). Escolher a senha nova prova o e-mail de novo, e o cadastro do fator vem no login seguinte (ASVS 6.4.4). O e-mail avisa o dono se o pedido não foi dele.

Coberto por `MfaTests`, `PasskeyTests` e `SecondFactorRulesTests`.

### Permissões reservadas e política de administradores (2026-09-29)

- Quem acessa o quê é decidido só pelo administrador do sistema. `@RequiresPermission(reserved = true)` marca a permissão; o catálogo expõe a flag (`GET /api/iam/permissions`), `RoleService` recusa permissão reservada em role que não seja a de sistema, e `ToolRegistry` recusa no boot tool que exija uma. Declarar a mesma chave reservada num lugar e não em outro também impede o boot.
- `iam.user.update` agora só renomeia (`PATCH /api/iam/users/{id}`). Atribuir roles é `PUT /api/iam/users/{id}/roles` com `iam.user.roles.assign` (reservada). Convite com roles exige a mesma permissão; sem ela, a pessoa convidada entra sem acesso.
- `AdministratorPolicy`: mínimo de administradores ativos (`os.iam.administrators.minimum`, padrão 2), confirmação da senha de quem concede a role de sistema e aviso aos demais administradores depois do commit (evento `AdministratorGranted`, só ids, entregue pelo Spring Modulith). `GET /api/iam/users/administrators` informa ativos e mínimo.
- Migração `V11` remove as permissões reservadas das roles personalizadas existentes e registra cada remoção em `audit_event` (`iam.role.reserved_permissions_removed`). Teste `ReservedPermissionsMigrationTests` roda a migração sobre dados reais.
- `iam_anonymize_user` deixou de ser tool de IA: apagar dados de forma irreversível é ato de uma pessoa no portal.

### Direitos do titular, LGPD art. 18 (2026-09-28)

- Acesso (inciso II): `GET /api/me/data` devolve JSON com tudo que o portal guarda sobre a pessoa, seção por módulo (`account`, `sessions`, `conversations`, `audit`). Cada módulo que guarda dado pessoal implementa `PersonalDataContributor`; `PersonalDataService` agrega e audita (`privacy.data.exported`). Botão em Configurações > Privacidade.
- Eliminação/anonimização (inciso VI): `POST /api/iam/users/{id}/anonymize` (`iam.user.anonymize`, permissão reservada, só pelo portal: não é tool de IA) só para conta já desativada: e-mail e nome viram placeholders, credencial e tokens somem, roles são removidas, sessões encerradas, conversas e memória do assistente apagadas. Conta anonimizada não reativa. A trilha de auditoria fica intacta (obrigação legal, art. 7 II e art. 16 I) e a linha `iam.user.anonymized` guarda só o id. Coberto por `PrivacyTests`.

### Trilha de auditoria consultável (2026-09-28)

`GET /api/audit/events` (paginado, filtros por quem, ação, entidade e período) e `GET /api/audit/events.csv` (até 10.000 linhas, RFC 4180, prefixo neutralizado contra CSV injection) atrás de `audit.event.read` e `audit.event.export`. Exportar gera a própria linha `audit.exported`. Tool `audit_search` dá ao agente a mesma consulta sob a mesma permissão. Tela em Administração > Auditoria. Coberto por `AuditTrailTests`.

### E-mail de convite e reset (2026-09-28)

`MailAccountNotifier` (ativo quando `spring.mail.host` está definido; exige então `OS_MAIL_FROM`) envia os links por SMTP em texto puro, sem HTML, e loga só o endereço, nunca o link. `application.yml` exige STARTTLS e define timeouts curtos. Em produção o SMTP é obrigatório (`ProductionMailCheck`). Convite e link do segundo fator redefinido saem depois do commit (`AccountLinkMailer`); o pedido de redefinição de senha responde igual para qualquer e-mail, grava uma linha de auditoria sem o endereço digitado e procura a conta, emite o token e envia o e-mail depois de responder (`AccountRecoveryService`). O indicador de saúde de mail fica desligado para uma falha de SMTP não derrubar o health check do container. Coberto por `MailAccountNotifierTests`.

### Senha do bootstrap (2026-09-28)

A senha do primeiro administrador foi escolhida ou gerada por quem instalou: no deploy de referência vem do secret `bootstrap_admin_password` (`deploy/init-secrets.sh`); em desenvolvimento, de `OS_BOOTSTRAP_ADMIN_PASSWORD`. A conta nasce com `password_change_required`; até a pessoa definir a própria senha, a API só responde `GET /api/me`, `POST /api/me/password`, `POST /api/auth/mfa`, logout e CSRF (`PasswordChangeGateFilter`, 403 com `type urn:os:problem:password-change-required`) e o portal mostra só a tela de segurança (senha e segundo fator), sem navegação, até a pessoa resolver (`AppShell`). Coberto por `PasswordChangeGateTests`. Desligável por `os.iam.bootstrap.require-password-change=false` (só faz sentido em teste).

### Revisão 2026-09-28 (fim da fase 4, módulo de exemplo `tasks`)

Checklist da seção 8 aplicado ao módulo, coberto por `TasksModuleTests`:

- Rotas `/api/tasks/**` caem em `anyRequest().authenticated()`; sem sessão, 401 em Problem Details.
- Cada use case de `TaskService` tem `@RequiresPermission` (`tasks.task.read|create|update|delete`); o controller só mapeia HTTP. Tool sem a permissão cai em `AccessDeniedException` mesmo que o modelo a nomeie.
- Validação nos dois caminhos: `@Valid` no request REST e checagem de tamanho dentro do use case, porque o JSON do modelo não passa por Bean Validation.
- Responsável só pode ser usuário existente e não desativado, resolvido pela API pública do `iam` (`UserDirectory`), nunca por id cru. Sem FK de banco entre módulos.
- Saída por DTO (`TaskSummary`) com nome do responsável; a entidade não sai do módulo.
- Criação, edição, conclusão, reabertura e exclusão geram `audit_event`; pelo agente herdam a origem `AI_TOOL`.
- `tasks_create`, `tasks_complete` e `tasks_delete` são `@RequiresConfirmation`: pelo agente só executam após confirmação humana. `tasks_list` e `tasks_get` são `@ReadOnlyTool`.

Decisão registrada: tarefas são visíveis a qualquer pessoa com `tasks.task.read` (quadro compartilhado da empresa, sem dado pessoal além do nome do responsável). Um módulo com dado restrito por dono ou setor precisa filtrar no use case, conforme o item 3 do checklist.

### Revisão 2026-10-02 (ASVS 5.0 nível 2, NIST SP 800-63B-4 AAL2)

Lista completa no CHANGELOG, em "Revisão de 2026-10-02". O que mudou nesta baseline:

- Segundo fator obrigatório para todos, com passkey ao lado do aplicativo autenticador, aplicado pelo modelo de multi-factor do Spring Security 7. O filtro próprio que fazia isso (`MfaGateFilter`) saiu.
- Limite de sessões simultâneas só com logins completos; step-up de 15 minutos para redefinir o segundo fator de outra pessoa; essa redefinição também invalida a senha e manda link por e-mail.
- Lockout no modelo do Keycloak, com bloqueio permanente em 100 falhas.
- Códigos de recuperação com Argon2id; novos códigos por `POST /api/me/mfa/recovery-codes`.
- Política de senha por code points e palavras do contexto.
- Pedido de redefinição de senha assíncrono; convite e links depois do commit; SMTP obrigatório em produção.
- Falha de login na trilha sem o e-mail digitado: só o id da conta, quando ela existe (`AuthenticationEventsListener`). O log `SECURITY` guarda o e-mail mascarado.
- Limpeza agendada de tokens e do arquivo de eventos.
- Roles de banco separados no deploy de referência.
- `@ReadOnlyTool`/`@RequiresConfirmation` obrigatórios em toda tool; criar e concluir tarefa pedem confirmação. Notas do portal no chat identificadas pela coluna `ai_pending_action.note` (`V15`).
- Logout limpa também o armazenamento do navegador; cabeçalhos COOP e CORP no web.
- Depois da primeira versão desta lista: id de sessão com 256 bits; cookies `__Host-`; reautenticação completa (7.5.1, 7.5.2) com step-up nas mudanças de fator, na troca de senha e no encerramento das próprias sessões; e-mail quando um fator muda; códigos de recuperação em conta só com passkey; TOTP só no passo atual; passkey recusada conta no lockout; logs estruturados em JSON com id da requisição; negações com a regra que negou; falha de tool sem detalhe interno para o modelo; `@ReadOnlyTool` em transação somente leitura; limpeza das ações do assistente; `audit-retention.sql`; redes Docker separadas, Caddy sem root, revogação de `PUBLIC` no Postgres, rotação de logs, backup e restauração atômicos.

## 9. Riscos aceitos

Estado em 2026-10-02. Cada um foi avaliado e fica como está até o cliente decidir outra coisa. Os itens que dependem da infraestrutura do cliente estão na tabela seguinte.

| Risco | Por que fica | O que muda se não for aceito |
|---|---|---|
| Lockout usado para negar serviço: quem sabe o e-mail de alguém consegue manter a conta bloqueada errando a senha | É o preço do bloqueio por conta; a documentação do Keycloak registra o mesmo compromisso ("Downside of brute force detection"). Como os controles limitam o bloqueio malicioso (ASVS 6.1.1): o rate limit por IP (20 logins/min, 5/min no segundo passo) limita o ritmo de quem tenta; o bloqueio é escalonado, não permanente: 15 min a mais a cada 5 falhas, até 6 h, e só vira permanente em 100 falhas seguidas; o contador zera depois de 12 h sem falha; e a pessoa desbloqueia sozinha pelo link de redefinição de senha, que chega ao e-mail dela, inclusive no bloqueio permanente. Um administrador também reativa a conta | Bloqueio por par conta + origem, ou CAPTCHA depois de algumas falhas |
| Dados pessoais enviados à Anthropic pelas tools de IA (nome, e-mail e o que mais as tools de um módulo devolverem) | Sem isso o agente não opera o sistema. A transferência internacional (LGPD art. 33) é decisão contratual do cliente, não do código | Não usar o assistente, ou tirar dado pessoal do retorno das tools |
| Segredo TOTP cifrado com `AesGcmBytesEncryptor` (AES-256-GCM) sem dado associado (AAD) | Quem pode escrever no banco poderia copiar o segredo cifrado de uma conta para outra. Para isso já precisa escrever na tabela `user_mfa`, o que no deploy de referência só `os_app`, `os_owner` e o superusuário fazem | Amarrar o cifrado ao id da conta como AAD (exige mudar de API de cifra) |
| `style-src 'unsafe-inline'` na CSP do web | Os primitivos do Radix posicionam popovers com atributo `style`. Scripts continuam só com nonce | Nonce também em `style-src`, quando os componentes permitirem |
| Token de convite e de redefinição na URL | Uso único, 48 h (convite) ou 1 h (redefinição), `Referrer-Policy: same-origin`, tokens apagados depois de usados ou vencidos | Código digitado em vez de link |
| Sessão serializada com JDK serialization pelo Spring Session | O conteúdo é gerado pela própria aplicação e o banco é fronteira de confiança | Serializador JSON do Spring Session |
| Código TOTP só no passo atual, sem a tolerância de um passo do RFC 6238 | O ASVS 6.5.5 limita a vida do código a 30 s. O custo é recusar o código digitado na virada do passo ou com o relógio do celular fora de hora; a pessoa digita o código seguinte | `Totp.WINDOW = 1`, com desvio do 6.5.5 |
| Linhas de log escritas pelo próprio Spring AI nas threads do Reactor, fora de uma tool call (por exemplo erro no stream do modelo), saem sem `http.request.id` e `client.ip` | O MDC é copiado para a thread do turno e para cada tool call, e a trilha do turno já tem IP e id da requisição. As threads internas do Reactor e do SDK da Anthropic não são nossas; o erro do turno também é registrado pela thread do turno, com o contexto | Propagação de contexto do Micrometer (`context-propagation`) com `Hooks.enableAutomaticContextPropagation()` |
| Fork com `os.iam.mfa.require-for-all: false` | Contas sem segundo fator usam só a senha: o ASVS 6.3.3 não é atendido, e encerrar as próprias sessões não pede reautenticação (7.5.2). A aplicação exige senha de 15 caracteres ou mais nesse caso (NIST, senha como fator único) e mantém o segundo fator para a role de sistema | Manter `require-for-all: true` (padrão) |
| Disco da VPS sem criptografia documentada pelo provedor (Hostinger) | O ASVS 5.0 deixa a proteção de cada dado para a documentação do projeto (14.1.2) e exige cumprir o documentado (14.2.4); a LGPD (art. 46) pede medidas aptas, sem citar criptografia de disco. Disco criptografado protege um disco levado do datacenter, não um servidor ligado nem o provedor, que guarda as chaves. Os dados ficam protegidos pelo acesso ao servidor, pelos roles do banco, pela cifra na aplicação e pelo backup cifrado fora do host | Provedor com criptografia de disco documentada, ou LUKS com desbloqueio manual a cada reinício (o portal fica fora até alguém digitar a senha) |
| Repositório do cliente no GitHub Free: sem proteção de branch nem aprovação de deploy em repositório privado | Quem tem escrita no repositório consegue publicar em produção e ler os secrets do Actions. O `cd.yml` roda o CI antes do deploy, e a chave do CD só implanta commits que já estão na `main`, sem shell no servidor | GitHub Team (proteção de branch, revisão obrigatória) ou Enterprise (aprovação de deploy em environment) |
| Imagens de terceiros (`postgres:18`, `caddy:2`) com vulnerabilidades altas ainda sem imagem corrigida publicada (em 2026-10-02: OpenSSL no Postgres; biblioteca padrão do Go e gRPC no Caddy) | Fixadas no digest mais recente publicado; o Dependabot (`docker`, `/deploy`) abre PR quando o upstream publica a correção. Nenhuma crítica. O Postgres só é alcançável pela rede interna, e o Caddy não usa gRPC | Construir imagens próprias desses serviços, com o custo de manter as atualizações delas |

### Responsabilidade da infraestrutura do cliente

O core e o deploy de referência deixam o caminho pronto, mas o controle depende do ambiente do cliente.

| Requisito | O que o deploy de referência faz | O que o cliente precisa fazer |
|---|---|---|
| Logs num sistema separado (ASVS 16.4.3) | JSON (ECS) no stdout, rotação local `json-file` de 50 MB × 5 | Mandar os logs para outro sistema, com retenção definida: driver de log do Docker (`syslog`, `fluentd`, `gelf`) ou agente no host (`docs/deploy.md`, "Logs"). Sem isso, root no host apaga o log e a rotação descarta o histórico |
| Cofre de segredos (ASVS 13.3.1) | Arquivos em `deploy/secrets/` (diretório `0700`), montados como secrets do Compose, fora do ambiente | Um cofre (Vault, o gerenciador de segredos da nuvem) que entregue os arquivos, se a política do cliente exigir |
| Firewall de saída no host | Redes Docker: só a API e o Caddy têm saída, web e Postgres não | Limitar a saída da API a Anthropic, Have I Been Pwned e SMTP no firewall do host ou da nuvem |
| Backup fora do host | `backup.sh` cifra com `age` e chama `BACKUP_UPLOAD_CMD`; o playbook agenda o cron e o ping de monitoramento | Destino do backup, guarda da chave privada do `age` e da cópia da chave de MFA, monitor que alerta quando o backup não roda |
| Backup e snapshot automáticos do provedor | Nenhum: são do painel do provedor | Desligar, ou registrar onde ficam e quem acessa: copiam o disco inteiro, com banco e `deploy/secrets/`, sem a cifra do `age` |
