# Baseline de segurança, auditoria e LGPD

Os dados tratados pelos sistemas derivados do `os-core` são confidenciais. Este documento define o mínimo obrigatório para todo fork. Itens marcados como **fase N** ainda não estão implementados no `os-core`; cada fase fecha os seus antes de ser considerada pronta.

Referências: OWASP ASVS 5.0 (V7, V8, V16), OWASP Cheat Sheets, OWASP Top 10 for LLM Applications 2025, LGPD (Lei 13.709/2018), Guia da ANPD para agentes de tratamento de pequeno porte.

## 1. Autenticação e sessão (ASVS V7)

| Requisito | Decisão | Status |
|---|---|---|
| Token de sessão gerado no backend com CSPRNG e no mínimo 128 bits (7.2.1, 7.2.3) | Session id do container servlet via Spring Session; não aceitamos id vindo do cliente | fase 1 |
| Novo token ao autenticar, invalidando o anterior (7.2.4) | Session fixation protection `changeSessionId`, padrão do Spring Security | fase 1 |
| Invalidação no servidor no logout (7.4.1) | Logout invalida a sessão no Postgres, apaga o cookie e envia `Clear-Site-Data: "cache","cookies"` | fase 2 |
| Encerrar todas as sessões ao desativar ou excluir usuário (7.4.2) | `SessionRegistry` + `FindByIndexNameSessionRepository` do Spring Session JDBC: desativar usuário chama `deleteById` em todas as sessões dele | fase 2 |
| Timeout de inatividade e tempo máximo absoluto (7.1.1, 7.3.1, 7.3.2) | Inatividade 30 min (`spring.session.timeout`). Absoluto 12 h: atributo `createdAt` na sessão verificado por filtro; ao estourar, invalida e exige novo login | fase 2 |
| Limite de sessões simultâneas documentado (7.1.2) | `maximumSessions(3)`, a sessão mais antiga é encerrada | fase 2 |
| Encerrar outras sessões após troca de senha (7.4.3) | Ao trocar senha, todas as outras sessões do usuário são apagadas | fase 2 |
| Reautenticação antes de alterar e-mail, senha ou dados de recuperação (7.5.1) | Endpoints sensíveis exigem senha atual no corpo da requisição | fase 2 |
| Usuário vê e encerra suas sessões; admin encerra sessões de qualquer usuário (7.4.5, 7.5.2) | `GET/DELETE /api/me/sessions`, `DELETE /api/iam/users/{id}/sessions` | fase 2 |
| Cookie `HttpOnly`, `Secure`, `SameSite`, sem `Domain` | `OS_SESSION`, `HttpOnly`, `SameSite=Lax`, `Secure` no perfil `prod`, `Path=/` | fase 1 |
| CSRF | `csrf.spa()` do Spring Security: cookie `XSRF-TOKEN` + header `X-XSRF-TOKEN`, com proteção BREACH | fase 2 |
| Armazenamento de senha | Argon2id via `Argon2PasswordEncoder` (parâmetros iguais ou acima do mínimo OWASP: 19 MiB, 2 iterações, paralelismo 1) dentro de `DelegatingPasswordEncoder` | fase 2 |
| Senha vazada | `HaveIBeenPwnedRestApiPasswordChecker` (k-anonymity, só 5 caracteres do hash saem do servidor) no cadastro e troca de senha | fase 2 |
| Força bruta | Limite por conta e por IP com backoff; lockout temporário registrado em log de segurança | fase 2 |
| Registro | Não existe registro público. Convite por e-mail com token de uso único, expira em 48 h, hash do token no banco | fase 2 |
| MFA | TOTP opcional por usuário, obrigatório para roles de administração | fase 3 ou posterior, conforme cliente |

## 2. Autorização (ASVS V8)

| Requisito | Decisão | Status |
|---|---|---|
| Regras de autorização documentadas (8.1.1) | Catálogo de permissões `modulo.recurso.acao` gerado a partir das anotações `@RequiresPermission` e exposto em `GET /api/iam/permissions` | fase 2 |
| Acesso por função restrito a permissão explícita (8.2.1) | `@RequiresPermission` no use case; método sem anotação em pacote `application` falha em teste de arquitetura | fase 2 |
| Acesso por dado restrito (IDOR/BOLA) (8.2.2) | Use case recebe o usuário atual e filtra por dono ou escopo; nunca confia em id do cliente | fase 2 em diante, por módulo |
| Enforcement em camada confiável (8.3.1) | Sempre no backend. O front só esconde o que o usuário não pode ver | fase 1 |
| Acesso por campo (8.2.3) | DTOs de saída específicos por caso de uso; nada de expor entidade JPA | fase 2 |
| Deny by default | `authorizeHttpRequests` termina com `anyRequest().authenticated()`; lista de rotas públicas é explícita e curta | fase 2 |

## 3. Headers, transporte e erros

- HSTS com `includeSubDomains` e `max-age` de 1 ano no perfil `prod`; TLS terminado no proxy reverso do cliente, `forward-headers-strategy=framework`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` restritiva. Spring Security e `next.config.ts` já cobrem os básicos.
- Content-Security-Policy no Next com nonce por requisição (fase 2). Sem `unsafe-inline` em `script-src`.
- Erros retornam Problem Details (RFC 9457) sem stack trace, sem mensagem interna, sem detalhe de binding (`server.error.include-*` desligados).
- Actuator expõe só `health`, sem detalhes.
- Swagger UI desligado por padrão e sempre desligado em `prod`; `api-docs` desligado em `prod`.

## 4. Logging e auditoria (ASVS V16, LGPD art. 37)

Dois trilhos separados:

**Log técnico de segurança** (arquivo ou stdout estruturado em JSON, enviado para fora do host):

- Login com sucesso e falha, logout, lockout, troca de senha, criação e revogação de sessão.
- Toda negação de autorização (usuário, permissão exigida, recurso, IP).
- Erros inesperados e falhas de controle de segurança.
- Cada entrada tem timestamp em UTC, ator, ação, origem, id de correlação. Dados pessoais no log só mascarados ou em hash. Entrada codificada para impedir log injection.

**Trilha de auditoria de negócio** (tabela `audit_event`, append-only, em `common`):

- Quem, quando, qual ação, sobre qual entidade, valores antes e depois quando aplicável, origem (REST ou tool de IA, com id da conversa).
- Escrita pelo próprio use case ou por listener de evento de domínio, dentro da mesma transação.
- Sem `UPDATE` nem `DELETE` na tabela: usuário de banco da aplicação recebe só `INSERT` e `SELECT` nela.
- Retenção definida por cliente, padrão 5 anos.

Toda tool call do agente de IA gera entrada na trilha, com sucesso ou erro (ver `ai-agent.md`).

## 5. Dados confidenciais

- Criptografia em trânsito obrigatória (TLS 1.2+). Em repouso, disco criptografado no host e backup criptografado.
- Campos de alta sensibilidade (documento, dados bancários, saúde, o que o cliente classificar) recebem criptografia em nível de aplicação com AES-256-GCM via `AttributeConverter` do JPA. A chave vem de variável de ambiente ou cofre, nunca do banco nem do repositório. Rotação de chave prevista com id de chave gravado junto ao dado.
- Segredos (`ANTHROPIC_API_KEY`, senha do banco, chave de criptografia) só por variável de ambiente. `.env`, `*.pem`, `*.key` e `application-local.yml` estão no `.gitignore`.
- Mínimo privilégio no banco: a aplicação usa um role sem `SUPERUSER`, sem `CREATE` em produção (migrações rodam com role separado).
- Backups diários, testados, retidos conforme contrato; restauração documentada.

## 6. LGPD

| Artigo | Obrigação | Como o OS atende |
|---|---|---|
| Art. 6 | Finalidade, adequação, necessidade, transparência, segurança, prevenção, não discriminação, responsabilização | Coleta mínima por módulo; cada campo pessoal documentado no inventário de dados do módulo |
| Art. 7 e 11 | Base legal para cada tratamento | Inventário de dados registra a base legal por campo ou processo; dado sensível exige base do art. 11 |
| Art. 18 | Direitos do titular: acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento, revogação de consentimento | Módulo `iam` oferece exportação dos dados do usuário e anonimização ou exclusão; módulos de negócio implementam `PersonalDataHandler` para participar dessas operações |
| Art. 37 | Registro das operações de tratamento | Trilha de auditoria (seção 4) + inventário de dados por módulo, no formato do modelo de Registro das Operações da ANPD |
| Art. 41 | Encarregado (DPO) | Campo de configuração do cliente exibido na página de privacidade do portal |
| Art. 46 | Medidas técnicas e administrativas de segurança | Este documento inteiro |
| Art. 48 | Comunicação de incidente à ANPD e aos titulares | Runbook de incidente em `docs/incident-response.md` (fase 2); logs de segurança fora do host viabilizam a investigação |
| Art. 15 e 16 | Término do tratamento e eliminação | Política de retenção por tipo de dado, job de expurgo ou anonimização |

Cada módulo de negócio novo preenche `docs/data-inventory/<modulo>.md`: campos pessoais, sensíveis ou não, base legal, finalidade, retenção, compartilhamento com terceiros.

### IA e LGPD

- Dados pessoais podem sair do host ao serem enviados ao provedor do modelo (Anthropic). Isso é operador de dados nos termos da LGPD e precisa constar no inventário e no contrato com o cliente.
- O system prompt e os resultados de tool enviados ao modelo devem conter só o necessário para a tarefa. Tools que retornam listas grandes devem paginar e resumir.
- Conversas com o agente ficam no Postgres do cliente (chat memory JDBC), sujeitas à mesma retenção e aos mesmos direitos do titular.

## 7. Agente de IA (OWASP Top 10 for LLM 2025)

| Risco | Mitigação |
|---|---|
| LLM01 Prompt injection | Tools são o único efeito colateral possível; filtro de tools por permissão; confirmação humana para ações destrutivas; entrada de tool passa pela validação do próprio use case (`@Valid`, regras de domínio); conteúdo vindo de dados (descrições, comentários, e-mails) é tratado como dado, nunca como instrução |
| LLM02 Vazamento de informação sensível | O modelo só vê o que o usuário atual pode ver, porque cada tool roda com a autorização do usuário; sem tool "genérica" de SQL |
| LLM05 Tratamento inseguro da saída | Saída do modelo é texto renderizado como texto no front, nunca HTML; ações de UI vêm em estrutura tipada, não em código |
| LLM06 Agência excessiva | Catálogo de tools é o catálogo de use cases já autorizados; nada é criado só para a IA; `maxCallsPerTool` e `maxTotalToolCalls` no `ToolCallingManager`; `resolution.fallback` desligado |
| LLM07 Vazamento de system prompt | System prompt não contém segredo nem regra de autorização; a autorização está no backend |
| LLM10 Consumo ilimitado | Limite de tokens por resposta, limite de chamadas por turno, rate limit por usuário, custo por conversa registrado |

## 8. Processo

- Dependabot semanal (`.github/dependabot.yml`) para Gradle, npm e GitHub Actions. O fork mantém.
- Teste de arquitetura (`ModularityTests`) e testes de segurança (`AuthAndIamFlowTests`: 401/403 em Problem Details, CSRF, login, permissão, convite, desativação imediata, lockout, troca de senha, escalação de privilégio, último admin) rodam no CI e bloqueiam merge.
- Revisão de segurança ao fim de cada fase e antes de cada entrega ao cliente, registrada abaixo. Checklist mínimo da revisão:
  1. Toda rota nova está atrás de `anyRequest().authenticated()` ou na lista pública com justificativa.
  2. Todo use case novo tem `@RequiresPermission`; controller não tem regra.
  3. Acesso a dado específico checa dono ou escopo no use case (IDOR).
  4. Quem concede permissão precisa possuí-la (`GrantGuard`).
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
| Login, reset e aceite de token sem limite por IP | Password spraying entre contas, esgotamento de CPU do Argon2, bombardeio de e-mail | `RateLimitFilter` por IP: 20 logins/min, 5 operações de recuperação/min. 429 em Problem Details |
| E-mail vindo do usuário ia cru para o log de segurança | Log injection | `Sanitize.forLog` em todo log com dado de entrada |
| `PATCH /users/{id}` sem `roleIds` apagava as roles | Erro operacional | `roleIds` obrigatório |
| `next` do login aceitava `//evil.com` | Open redirect | `safeInternalPath` no front |
| Páginas do Next sem CSP | XSS ampliado | CSP com nonce por requisição em `proxy.ts`, `script-src` só com nonce, páginas dinâmicas |
| OpenAPI acessível sem sessão fora de produção | Exposição da superfície da API | Exige sessão em qualquer perfil; desligado em `prod` |
| `forward-headers-strategy=framework` confiava em qualquer `X-Forwarded-*` | Spoof de esquema/host/IP se o app for alcançável sem o proxy | `native` (RemoteIpValve, só proxies internos) + instrução de firewall |
| Link de convite ia para o log de aplicação | Segredo em log enviado para fora | Logger do notifier em WARN no perfil `prod`; link continua na resposta ao admin |

### Revisão 2026-09-28 (fim da fase 3, módulo `ai`)

Controles implementados e cobertos por `AiToolsTests`:

- Boot falha se existir `@Tool` sem `@RequiresPermission` (`ToolRegistry`).
- Catálogo por usuário = tools cuja permissão está nas authorities da sessão; `spring.ai.tools.resolution.fallback` fica desligado, então nome fora da lista não resolve.
- Use case executa via proxy Spring: `@PreAuthorize` roda de novo dentro da tool.
- `@Destructive` vira `ConfirmingToolCallback`: registra `ai_pending_action` (TTL 5 min), modelo recebe `PENDING_CONFIRMATION`; execução só em `POST /api/ai/actions/{id}/confirm` pelo mesmo usuário, com autorização do use case e auditoria em transação separada (falha vira `FAILED`, nunca fica pendente).
- Toda tool call auditada (`ai.tool.executed`/`failed`) com origem `AI_TOOL` e id da conversa via `AuditContext`; auditorias do próprio use case herdam a origem.
- Limites por turno: 10 chamadas por tool, 30 no total (`spring.ai.tools.limits.*`); mensagem do usuário até 4000 caracteres; janela de memória 40 mensagens.
- Conversas são do usuário: toda leitura filtra por `user_id`; inexistente ou alheia responde 404.
- System prompt versionado, sem segredo e sem regra de autorização; trata conteúdo de dados como dado.
- Prompt caching só do system prompt (`SYSTEM_ONLY`); catálogo de tools varia por usuário.
- SSE roda em virtual thread com `DelegatingSecurityContextRunnable`; erro para o cliente é genérico, detalhe fica no log.

Aceitos com justificativa: token de convite na URL (uso único, 48 h, `Referrer-Policy: same-origin`); `style-src 'unsafe-inline'` (Radix posiciona popovers com `style`; scripts continuam só com nonce); sessão serializada com JDK serialization pelo Spring Session (conteúdo gerado pela própria aplicação, banco é fronteira de confiança).

### Trilha de auditoria consultável (2026-09-28)

`GET /api/audit/events` (paginado, filtros por quem, ação, entidade e período) e `GET /api/audit/events.csv` (até 10.000 linhas, RFC 4180, prefixo neutralizado contra CSV injection) atrás de `audit.event.read` e `audit.event.export`. Exportar gera a própria linha `audit.exported`. Tool `audit_search` dá ao agente a mesma consulta sob a mesma permissão. Tela em Administração > Auditoria. Coberto por `AuditTrailTests`.

### E-mail de convite e reset (2026-09-28)

`MailAccountNotifier` (ativo quando `spring.mail.host` está definido) envia os links por SMTP em texto puro, sem HTML, e loga só o endereço, nunca o link. `application-prod.yml` exige STARTTLS e define timeouts curtos. O indicador de saúde de mail fica desligado para uma falha de SMTP não derrubar o health check do container. Coberto por `MailAccountNotifierTests`.

### Senha do bootstrap (2026-09-28)

A senha do primeiro administrador vem de variável de ambiente, ou seja, foi digitada por quem instalou. A conta nasce com `password_change_required`; até a pessoa definir a própria senha, a API só responde `GET /api/me`, `POST /api/me/password`, logout e CSRF (`PasswordChangeGateFilter`, 403 com `type urn:os:problem:password-change-required`) e o portal prende a pessoa em "Minha conta". Coberto por `PasswordChangeGateTests`. Desligável por `os.iam.bootstrap.require-password-change=false` (só faz sentido em teste).

### Revisão 2026-09-28 (fim da fase 4, módulo de exemplo `tasks`)

Checklist da seção 8 aplicado ao módulo, coberto por `TasksModuleTests`:

- Rotas `/api/tasks/**` caem em `anyRequest().authenticated()`; sem sessão, 401 em Problem Details.
- Cada use case de `TaskService` tem `@RequiresPermission` (`tasks.task.read|create|update|delete`); o controller só mapeia HTTP. Tool sem a permissão cai em `AccessDeniedException` mesmo que o modelo a nomeie.
- Validação nos dois caminhos: `@Valid` no request REST e checagem de tamanho dentro do use case, porque o JSON do modelo não passa por Bean Validation.
- Responsável só pode ser usuário existente e não desativado, resolvido pela API pública do `iam` (`UserDirectory`), nunca por id cru. Sem FK de banco entre módulos.
- Saída por DTO (`TaskSummary`) com nome do responsável; a entidade não sai do módulo.
- Criação, edição, conclusão, reabertura e exclusão geram `audit_event`; pelo agente herdam a origem `AI_TOOL`.
- `tasks_delete` é `@Destructive`: pelo agente só executa após confirmação humana.

Decisão registrada: tarefas são visíveis a qualquer pessoa com `tasks.task.read` (quadro compartilhado da empresa, sem dado pessoal além do nome do responsável). Um módulo com dado restrito por dono ou setor precisa filtrar no use case, conforme o item 3 do checklist.
