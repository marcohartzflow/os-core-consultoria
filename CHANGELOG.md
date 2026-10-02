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
- Desempenho das listagens medido com 3 milhões de eventos (`scripts/perf`, `docs/performance.md`): auditoria paginada por posição com contagem limitada a 10.000, índices compostos e trigram, totais do painel pré-somados em 15 minutos, ids UUIDv7, plano por execução e `statement_timeout` no pool. Primeira página da auditoria 153 → 14 ms, busca por e-mail 628 → 43 ms, painel 143 → 13 ms.
- Configurações em janela (bloco `sidebar-13` do shadcn), aberta pelo menu do usuário, pela busca ou por `⌘,`: tema, perfil, segurança, sessões e privacidade. `/account` só redireciona para ela.
- Portal redesenhado no estilo do template next-shadcn-admin-dashboard e do bloco dashboard-01 do shadcn: painel com indicadores, gráfico de atividade e cards de segurança; listas com busca, filtros facetados, colunas, paginação e ações por linha com confirmação; detalhe do usuário e Minha conta em abas; menu "Criar", breadcrumb, busca `⌘J`, tema claro/escuro; login em duas colunas.
- Tratamento de erros padronizado: toasts nas ações, erro por campo nos formulários, telas de erro com "Tentar novamente", página 404 e limite de erro do portal.
- API: `GET /api/audit/activity` (eventos por dia no fuso de quem vê), `mfaEnabled` no usuário, `userCount` na role, filtros `origin` e `correlationId` na auditoria, erros de validação com o campo (`errors`) e em português.
- Assistente como janela lateral redimensionável e recolhível (`⌘I`), ao lado da página: histórico, busca, exportação, parar resposta, Markdown, ações por mensagem e configurações em abas; itens ainda sem servidor aparecem como "Prévia".
- Todas as listas paginadas no servidor com o mesmo contrato (`page`, `size`, `sort` com lista permitida, `{content, page}`): usuários, roles, tarefas e auditoria, com busca e filtros no banco. No web, tabelas com estado na URL, seletor de pessoa com busca no servidor e espaçamento único nos cards de lista.
- `pnpm demo:data`: popula um ambiente local com dados de demonstração pela API (recusa hosts que não sejam locais).
- Módulos registram entradas no menu "Criar" (`moduleQuickCreate`) e no painel (`src/modules/dashboard.ts`).

### Alterado

- Permissões reservadas ao administrador do sistema: criar, editar e excluir roles, atribuir roles (`iam.user.roles.assign`, nova), redefinir o segundo fator de outra pessoa e anonimizar. Não entram em outras roles e não viram tools de IA (`iam_anonymize_user` foi removida).
- `iam.user.update` só renomeia (`PATCH /api/iam/users/{id}`, corpo `{name}`); roles vão por `PUT /api/iam/users/{id}/roles`. Convite com roles exige `iam.user.roles.assign`.
- Pelo menos 2 administradores ativos (`os.iam.administrators.minimum`); conceder a role de sistema pede a senha de quem concede e avisa os demais administradores por e-mail.
- Deploy de cliente (`docs/deploy.md`, `docs/fork.md`): a `develop` integra e valida, a `main` é produção. O `cd.yml` chama o `ci.yml` (`workflow_call`) e só constrói e implanta se ele passar; push na `main` não roda mais o CI duas vezes. Rollback pelo Run workflow com o SHA de um deploy anterior. Sem `environment: production` (no GitHub Free, repositório privado não tem secrets nem proteção de environment). Actions fixadas por SHA.
- A chave SSH do CD só executa `deploy/ci-deploy.sh` (comando forçado com `restrict`), que aceita só `deploy <sha>` de um commit da `origin/main`; o token do registry vive numa configuração temporária do Docker, apagada mesmo se o deploy falhar. `OS_IMAGE_REPOSITORY` vem só do `.env` do servidor.
- Preparação do servidor pelo playbook `deploy/ansible/provision.yml` (Ubuntu 22.04, 24.04, 26.04): administradores com chave e `sudo`, usuário `deploy`, SSH sem senha e sem root, `ufw`, Docker pelo repositório oficial, atualizações automáticas de segurança, relógio sincronizado, clone com deploy key só de leitura, `init-secrets.sh` e backup diário com ping opcional de monitoramento. Testado num Ubuntu 24.04 (container com systemd), duas execuções seguidas.
- `update.sh` roda as migrações (`docker compose run migrate`) antes de parar a API antiga: uma migração que falha não derruba mais o portal. Só grava a versão nova no `.env` depois que ela está no ar, e mantém no servidor as imagens das três últimas versões implantadas (`deploy/.deployed-tags`), apagando as demais.
- Verificação depois do deploy: `update.sh` usa `docker compose up --wait` (falha se a API não ficar saudável) e o CD confere `DEPLOY_URL/api/health` de fora. `/api/health` é a saúde da API (só o status) na origem pública, para o CD e o monitor externo.
- Deploy com menos indisponibilidade (de 15 a 21 s para 7 a 13 s, medido em 2 vCPU e 4 GB): health checks a cada segundo enquanto o container sobe (`start_interval`), a migração não roda de novo com a API parada, e API e web reiniciam um de cada vez.
- `/api/health`: só o status (sem os grupos `liveness` e `readiness`), resposta em cache por 5 s, e 503 em até 5 s com o banco fora (tempo de espera do pool de conexões reduzido de 30 s para 5 s).
- Teste mensal de restauração (`deploy/restore-check.sh`, agendado pelo playbook): o dump do banco é carregado num Postgres temporário e comparado com o banco real.
- Reinício automático às 04:00 (horário do servidor) quando uma atualização pede, para a correção de kernel valer (`unattended-upgrades`, `os_reboot_time`).
- CI: job `deploy-scripts` com `shellcheck` dos scripts de `deploy/` e `ansible-lint` do playbook; coleção `community.general` fixada em 13.x. O `shellcheck` achou um `A && B || C` no `backup.sh`, reescrito como `if`.
- Dependabot com `cooldown` de 7 dias nas atualizações de versão (as de segurança não esperam): uma versão comprometida costuma ser retirada em poucos dias.
- CI: `zizmor` audita os workflows (`.github/zizmor.yml`) e o Grype varre as imagens; vulnerabilidade crítica com correção barra o build e o deploy. Checkouts com `persist-credentials: false`.
- Migrações seguem a mudança em paralelo (expand/contract, `CONTRIBUTING.md`), para o rollback sempre rodar a imagem anterior sobre o schema novo.
- Disco criptografado deixa de ser exigido (risco aceito em `security-baseline.md`, seção 9); backup e snapshot do provedor precisam ser desligados ou registrados. Novas seções em `deploy.md`: "Fluxo de branches", "Preparar o servidor", "Entrada em produção", "Monitoramento". `fork.md` ganha início e fim de contrato e remove o `dependabot.yml` do fork.

### Segurança

Revisão completa de 2026-09-29 (três frentes: auth/iam, agente de IA, web/deploy). Corrigido:

- Login dentro de uma sessão já verificada pelo segundo fator herdava a verificação; agora todo login começa uma sessão nova.
- Reenvio de convite, edição, desativação, reativação, anonimização e reset do segundo fator exigem que o ator tenha todas as permissões do alvo (`GrantGuard.assertCanManage`).
- Confirmação de ação destrutiva do assistente é reivindicada atomicamente (`PENDING` para `EXECUTING`): duas confirmações concorrentes executam uma vez; expiração é registrada e auditada.
- Resultado de tool nunca entra no prompt de sistema; o desfecho vira nota fixa no papel de usuário, oculta na tela e na exportação.
- Falhas de código MFA contam no lockout da conta e são auditadas (`iam.mfa.failed`).
- Cookie de sessão expirado prendia o navegador num ciclo `/` ↔ `/login`: o proxy não redireciona mais a tela de login só pela presença do cookie; ela consulta `/api/me` e segue só com sessão viva.
- Busca da auditoria trata `%` e `_` como texto, não como curinga do `LIKE`.
- `audit_event` é append-only por trigger (`V10`), para qualquer role.
- Link de convite só é devolvido ao administrador quando não há entrega por e-mail.
- Eventos de domínio carregam só o id do usuário (o arquivo de eventos guardava e-mail após anonimização).
- Turno do assistente cancela ao desconectar ou por timeout (`os.ai.turn-timeout`); limite de turnos simultâneos por pessoa (`os.ai.max-concurrent-turns-per-user`).
- Tokens de convite e reset, códigos de recuperação e passos TOTP são de uso único decidido no banco; códigos de recuperação com HMAC sob a chave de MFA; troca de senha apaga tokens de reset pendentes.
- Dependências com vulnerabilidade conhecida achadas pela varredura das imagens: Tomcat 11.0.24 para 11.0.26 (três críticas), BouncyCastle 1.80 para 1.86 (crítica), Jackson 3.1.5 para 3.1.7 e 2.21.5 para 2.21.7 (altas), imagens base do Temurin atualizadas (OpenSSL, alta). A imagem do web perde npm, npx, corepack e yarn, que não rodam em produção e traziam dependências vulneráveis.
- Verificação de senha vazada indisponível recusa a senha com mensagem clara (fail-closed); e-mail de reset sai fora da requisição.
- `UiAction.Navigate` só aceita caminho absoluto simples; rate limiter por /64 em IPv6, poda limitada, sem perder hits.
- Web reage a 401 e aos 403 de gate em qualquer chamada; tela de conta não dispara chamadas bloqueadas pelo gate.
- Limite de sessões simultâneas não era aplicado (a sessão mais antiga só era marcada como expirada); agora a mais antiga recebe 401.
- Com `SPRING_MAIL_HOST` vazio (caso do Compose sem SMTP) o notificador de e-mail era ativado sem servidor e os links de convite não chegavam a ninguém; agora vale o repasse ao administrador.
- Editar ou excluir uma role exige ter todas as permissões dela. Cada tool call do assistente usa as permissões atuais da pessoa (revogação no meio do turno vale na próxima chamada). Hash bcrypt legado vira Argon2id no próximo login.
- Imagens base fixadas por digest; segredos de produção como arquivos (Compose secrets + config tree), fora do ambiente.
- CD com host key fixada, imagens construídas no CI e publicadas no registry (`update.sh <tag>`, rollback pela tag anterior); Compose sem capabilities além das que cada serviço precisa (postgres e caddy), sem ganho de privilégio, read-only, limites de memória e processos; Caddy com limite de corpo; backup criptografado com `age` e `restore.sh`.

Revisão de 2026-09-30 (usuários, roles, permissões e auditoria; API e web). Corrigido:

- Um novo login com a senha zerava o contador de falhas do segundo fator, então "entrar, tentar 4 códigos, entrar de novo" nunca bloqueava. Agora o contador só volta a zero com o login completo.
- Senha digitada para confirmar uma mudança (trocar senha, ativar ou desativar o segundo fator, conceder administrador) conta no bloqueio da conta, e conta bloqueada não confirma nada: uma sessão roubada não serve para adivinhar a senha. Ativar o segundo fator passou a pedir a senha.
- Conta bloqueada, desativada ou convidada respondia ao login mais rápido que as outras (sem calcular o hash), o que revelava que ela existe. Agora toda tentativa calcula o Argon2id.
- O id da sessão muda depois do segundo fator e da troca de senha, e o token CSRF muda no login.
- Um login simultâneo a uma desativação ou troca de senha podia regravar o status ou a senha antigos (`@DynamicUpdate` em `User`); contagem de falhas com a linha travada; duas desativações simultâneas não passam mais juntas pelo mínimo de administradores.
- A exportação dos dados pessoais não ficava na trilha (a transação era somente leitura e o registro nunca era gravado); o gravador de auditoria agora recusa transação somente leitura. A exportação da trilha grava o registro antes de enviar o arquivo.
- A exportação dos dados pessoais inclui também os eventos sobre a conta e as tentativas com o e-mail da pessoa, e diz quando foi cortada.
- Redirecionamento aberto no login (`next=/%09/site.com`).
- Convite de conta desativada não ativa mais a conta; desativar apaga os links pendentes. Encerrar sessões de outra pessoa exige poder gerenciá-la, e não vale para a própria conta.
- Conflitos de corrida (e-mail duplicado, role excluída durante a atribuição) respondem 409 em vez de 500.
- Logout, bloqueio de conta e acesso negado vão para o log `SECURITY`, que passou a gravar id ou e-mail mascarado em vez do e-mail. Falha de login com texto que não é e-mail não grava o texto na trilha.
- Permissões que uma versão passa a reservar saem das roles personalizadas na subida seguinte.
- Consulta à verificação de senha vazada com tempo limite (3 s para conectar, 5 s para responder).
- Configurações `os.iam.*` e `os.auth.*` fora do razoável impedem a subida.
- Limites de tamanho nas listas enviadas à API.
- Fuso horário com deslocamento fixo (`+03:00`) deslocava os dias do gráfico em seis horas; agora só nomes de fuso são aceitos.
- Datas absurdas na auditoria (ano -5000) davam erro 500; agora dão erro 400.
- A busca por e-mail aceitava " a " como 3 caracteres.
- A neutralização de fórmulas no CSV não cobria a quebra de linha inicial nem os caracteres de largura total.
- As conexões usadas pelas migrations voltavam ao pool sem o limite de 15 s; agora são descartadas depois da migration.
- Totais do painel: um evento com data no futuro não trava mais a recontagem, e uma recontagem sem mudança não regrava a linha.
- A V13 pode rodar de novo com segurança e não fica esperando o travamento da tabela.
- Web:
  - com o segundo fator pendente, nenhuma outra tela monta;
  - os códigos de recuperação não somem ao fechar as configurações ou quando a sessão atualiza;
  - baixar arquivos mostra o erro em vez de salvar o JSON do erro;
  - respostas antigas não sobrescrevem as novas (`useLoad`, `/api/me`);
  - o formulário de convite limpa ao cancelar;
  - mudar o próprio acesso atualiza o portal e pede confirmação para deixar de ser administrador;
  - `sort` e `size` inválidos na URL são ignorados;
  - acessibilidade dos seletores de role e das dicas;
  - removido o cabeçalho `X-Powered-By`.

Revisão de 2026-10-02 (padrão: OWASP ASVS 5.0 nível 2 e NIST SP 800-63B-4 AAL2; cada decisão com fonte oficial ou projeto de produção). Corrigido:

- Segundo fator obrigatório para todos (`os.iam.mfa.require-for-all: true`, ASVS 6.3.3). Quem desligar precisa de senha com 15 caracteres ou mais (NIST, senha como fator único); a aplicação não sobe de outro jeito.
- Passkeys (WebAuthn) como segundo fator, ao lado do aplicativo autenticador: o NIST exige oferecer uma opção resistente a phishing no AAL2. Usa o relying party do Spring Security (`spring-security-webauthn`, WebAuthn4J) com o schema JDBC oficial (`V16`); uma resposta assinada para outro site é recusada.
- O segundo fator segue o modelo oficial do Spring Security 7: cada fator vira um `FactorGrantedAuthority` e as regras de autorização exigem senha + TOTP ou senha + passkey (`AllRequiredFactorsAuthorizationManager`). O `MfaGateFilter` próprio saiu.
- O limite de sessões simultâneas só conta logins completos e roda quando o segundo fator é aceito: quem sabe só a senha não derruba mais as sessões verificadas. O token CSRF também é trocado nesse momento.
- Step-up: redefinir o segundo fator de outra pessoa exige o próprio segundo fator nos últimos 15 minutos (`validDuration`); o portal pede o código e repete a ação.
- Redefinir o segundo fator de alguém agora também invalida a senha, encerra as sessões e manda à pessoa um e-mail com o link para criar outra senha (ASVS 6.4.4: a recuperação prova o mesmo que o cadastro). O e-mail avisa o dono se o pedido não foi dele.
- Lockout no modelo do Keycloak: a cada 5 falhas a conta bloqueia 15 minutos a mais que da vez anterior (até 6 horas), o contador só volta a zero depois de um acesso certo ou de 12 horas sem erro, e 100 falhas seguidas bloqueiam até a redefinição da senha (limite do NIST). Antes o contador zerava a cada bloqueio.
- Códigos de recuperação guardados com Argon2id e sal, como senhas (ASVS 6.5.2). A chave do MFA passa a ter um só uso: cifrar o segredo TOTP.
- Pedido de redefinição de senha faz o mesmo trabalho para qualquer e-mail e emite o link depois de responder (OWASP Forgot Password Cheat Sheet); um e-mail que não é conta não deixa rastro.
- Convite e link de redefinição saem depois do commit, com o token já gravado, e são reenviados se o SMTP falhar (registro de publicações do Spring Modulith).
- A trilha de auditoria não guarda mais o que foi digitado como e-mail num login errado: guarda o id da conta quando ela existe, e nada quando não existe.
- Senha: tamanho contado em caracteres Unicode e recusa do nome do portal e do e-mail da pessoa (NIST, ASVS 6.2.11).
- SMTP obrigatório em produção: aceitar o convite é o que prova que o e-mail é da pessoa.
- Limpeza agendada de tokens de convite e redefinição usados ou vencidos, e do arquivo de eventos do Spring Modulith depois de 30 dias.
- Toda tool de IA declara `@ReadOnlyTool` ou `@RequiresConfirmation`; sem uma das duas a aplicação não sobe. Criar e concluir tarefa passam a pedir confirmação, e o cartão mostra os argumentos exatos (OWASP LLM06).
- LGPD: a exportação dos próprios dados lista as passkeys e não mostra mais e-mail e IP de administrador que agiu na conta; as notas do portal no chat são identificadas por registro (`V15`), não por um prefixo que a pessoa podia digitar.
- Deploy: roles de banco separados. `postgres` só administra, `os_owner` é dono do schema e só o serviço único `migrate` (Flyway) tem a senha dele, e a API usa `os_app`, que não é dona de nada e só tem `SELECT`/`INSERT` na auditoria (callback `afterMigrate.sql`). Conferido num Postgres 18: com as credenciais da API não dá para alterar, apagar ou truncar a auditoria, desligar os triggers, usar `session_replication_role` nem criar tabelas.
- Deploy: senha inicial do administrador como secret do Compose, Caddy com sistema de arquivos somente leitura, backup sem as sessões.
- Códigos de recuperação podem ser gerados de novo em Segurança (`POST /api/me/mfa/recovery-codes`, com a senha atual); os antigos deixam de valer.
- O segredo TOTP passa a ser cifrado com `AesGcmBytesEncryptor` (o `AesBytesEncryptor` está obsoleto no Spring Security 7.1).
- Auditoria do login registra os fatores (ASVS 16.3.1): o passo da senha diz se o segundo fator ainda está pendente, e o segundo passo diz qual fator foi usado.
- Exportação CSV da auditoria: célula que começa com `=`, `+`, `-` ou `@` recebe um TAB no início, dentro das aspas, como a OWASP recomenda. A aspa simples usada antes se perde quando o Excel salva o arquivo.
- O limite de sessões e a lista "minhas sessões" ignoram sessões que já passaram do tempo absoluto de 12 horas.
- Web: passkeys em Segurança (listar, adicionar com nome e senha, remover), "Usar chave de acesso" no segundo passo do login e na reconfirmação, e geração de novos códigos de recuperação. Usa as funções nativas do navegador para WebAuthn, sem dependência nova.
- Web: logout limpa o armazenamento do navegador (`Clear-Site-Data: "storage"`) e as preferências do assistente; cabeçalhos `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`; as telas cancelam as requisições que ficaram para trás (`AbortController`); `date-fns` removido.
- Id de sessão com 256 bits aleatórios em Base64url, no lugar do UUID do Spring Session, que tem 122 (ASVS 7.2.3 e 11.5.1: UUID não serve como valor impossível de adivinhar). `SessionIds`; a `V17` aumenta a coluna e põe `UNIQUE` em `user_entities.name`.
- Em HTTPS os cookies se chamam `__Host-OS_SESSION` e `__Host-XSRF-TOKEN` (ASVS 3.3.1 e 3.3.3): o navegador só os aceita com `Secure`, `Path=/` e sem `Domain`, então um subdomínio vizinho não consegue gravá-los. Em desenvolvimento sem HTTPS (`os.auth.session.cookie-secure: false`) ficam os nomes sem prefixo.
- Reautenticação completa (ASVS 7.5.1 e 7.5.2). Numa conta com segundo fator, mudar os fatores (configurar e confirmar o aplicativo autenticador, desativá-lo, gerar códigos de recuperação, opções, cadastro e remoção de passkey), trocar a senha e encerrar as próprias sessões exigem um segundo fator dos últimos 15 minutos, mais a senha quando a requisição a pede. O portal abre a reconfirmação e repete a ação. Cadastrar mais um fator numa sessão antiga não conta mais como tê-lo passado: só o primeiro fator da conta vale para a sessão.
- Desativar o aplicativo autenticador não pede mais o código: a sessão já prova o fator pelo step-up. `POST /api/me/mfa/disable` recebe só `{currentPassword}`.
- E-mail à pessoa quando um fator é cadastrado ou removido e quando novos códigos de recuperação são gerados (NIST SP 800-63B-4, aviso de vínculo de autenticador). Sai depois do commit, sem link (`AccountLinkMailer.FactorChanged`, `AccountNotifier.sendSecondFactorChanged`).
- Códigos de recuperação também em contas só com passkey. Remover o último fator apaga os códigos dele; um fator cadastrado depois traz códigos novos.
- O código do aplicativo autenticador vale só no passo de 30 s atual (ASVS 6.5.5, `Totp.WINDOW = 0`). É um desvio consciente do RFC 6238, que permite um passo de tolerância.
- Passkey recusada no segundo passo do login conta no bloqueio da conta, e `POST /api/auth/mfa/passkey` tem limite por IP.
- Log `SECURITY` também para recusa por segundo fator ausente ou vencido e para código ou passkey recusados no cadastro. Acesso negado vai para o log com método, URI e a regra que negou (`Denials`). `os.iam.password.max-length` passa a ter teto de 128.
- Logs estruturados em JSON (ECS) no perfil `prod`, com `http.request.id` e `client.ip` em cada linha (`RequestLoggingContextFilter`, `LoggingConfig`). O id volta no cabeçalho `X-Request-Id` e é o `correlationId` das linhas da trilha gravadas por requisição REST.
- Falha de tool de IA: o modelo só recebe a mensagem de uma regra de negócio, "sem permissão" ou "erro interno" (`SafeToolExceptionProcessor`, OWASP LLM02); a causa real fica na trilha e no log `SECURITY` (`ToolFailures.unwrap`). A pessoa vê o mesmo texto no chat, sem nome de classe de exceção; o mesmo vale para uma ação confirmada que falha (nota da conversa e resultado gravado).
- `@ReadOnlyTool` agora é garantido por uma transação somente leitura (`ReadOnlyTransactionToolCallback`): o Postgres recusa qualquer escrita. Uma tool de leitura com `REQUIRES_NEW` ou `NOT_SUPPORTED` impede a subida.
- `audit_search` não manda IP ao modelo (`AuditEntryForAgent`).
- Ações propostas pelo assistente: as vencidas viram `EXPIRED` a cada 5 minutos (`ai.action.expired`, origem `SYSTEM`), e as resolvidas são apagadas depois de 90 dias. As que ainda têm nota na conversa ficam, sem argumentos e sem resultado (`PendingActionCleanup`).
- LGPD: a exportação dos próprios dados ganhou a seção `tasks` (tarefas criadas pela pessoa ou atribuídas a ela) e as ações propostas em cada conversa.
- `db/retention/audit-retention.sql`: retenção da trilha de auditoria, rodada à mão pelo dono do schema, numa transação, e registrada na própria trilha (`audit.retention.purged`).
- Web: `base-uri 'none'` na CSP; o armazenamento do assistente é limpo também quando a sessão acaba sem logout; erro inesperado mostra texto genérico (só `UserFacingError` e erros da API mostram a própria mensagem); campos de código aceitam código de recuperação; reconfirmação do segundo fator em todas as ações de segurança (aplicativo autenticador, passkeys, senha, sessões); o streaming do assistente trata 401 e os 403 de gate como as outras chamadas; o token CSRF é lido de `__Host-XSRF-TOKEN` ou `XSRF-TOKEN`; cookies da interface com `Secure` em HTTPS.
- Deploy: SMTP obrigatório também no Compose (`SPRING_MAIL_HOST` e `OS_MAIL_FROM`, senão não sobe).
- Deploy: redes Docker separadas. O Postgres só é alcançado pelo `migrate` e pela API; web e Postgres não têm saída para a internet; só a API (Anthropic, Have I Been Pwned, SMTP) e o Caddy saem; só o Caddy publica portas.
- Deploy: Caddy sem root (uid 10001), só com `NET_BIND_SERVICE`.
- Deploy: Postgres com sistema de arquivos raiz somente leitura (`read_only`, OWASP Docker Security Cheat Sheet, regra 8); grava só no volume e nos `tmpfs` `/tmp` e `/run/postgresql`. Testado com a imagem fixada: inicializa um volume vazio (com `postgres-roles.sh`) e reinicia sobre um existente.
- Deploy: Caddy recusa `TRACE` e `TRACK` com 405 antes de repassar (ASVS 13.4.4).
- Deploy: `postgres-roles.sh` revoga de `PUBLIC` o `CONNECT` e o `TEMPORARY` no banco `os` e o `CONNECT` em `postgres` e `template1`; `os_app` recebe `CONNECT` só em `os`. `DatabaseRolesTests` roda o `postgres-roles.sh` de verdade num PostgreSQL 18 e confere cada recusa.
- Deploy: rotação de log `json-file` (50 MB × 5) em todos os serviços; seção "Logs" em `docs/deploy.md`.
- Deploy: `backup.sh` nunca deixa arquivo pela metade; `restore.sh` descriptografa e descompacta para um arquivo temporário privado, recusa o backup se algum passo falhou ou se falta a linha final do `pg_dump` (`-- PostgreSQL database dump complete`) e só então carrega numa só transação com `ON_ERROR_STOP` (antes, um backup truncado lido pelo pipe era confirmado pela metade); `update.sh` só pula o backup quando o Postgres não está rodando (primeira instalação).
- Deploy: IP do cliente atrás de balanceador (ASVS 15.3.4). O balanceador entra em `OS_TRUSTED_PROXIES` (faixas CIDR), lida pelo Caddy (`trusted_proxies` com `trusted_proxies_strict`); vazia, nenhum proxy é confiável. O Caddy repassa só o IP do cliente no `X-Forwarded-For` (`{client_ip}`), e o Tomcat mantém o padrão do Spring Boot para `server.tomcat.remoteip.internal-proxies`. Sai a orientação de pôr o balanceador em `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES`: ela substituía as faixas privadas, o Tomcat deixava de confiar no container web e ignorava o `X-Forwarded-For`, e o Caddy, sem `trusted_proxies`, já descartava o valor do balanceador.
- Deploy: depois de restaurar um backup, refaça as anonimizações (LGPD) feitas depois da data dele (`docs/deploy.md`, "Backup e restauração").
- Assistente (OWASP LLM10, ASVS 15.2.2): limite de turnos por pessoa por minuto (`os.ai.turns-per-minute`, padrão 20, janela deslizante), além dos 2 simultâneos; acima disso, 429 com Problem Details. O limitador em memória saiu de `auth` para `common` (`RateLimiter`) e é o mesmo do login. Cada turno grava `ai.turn.ended` na trilha com o desfecho e os tokens que o modelo informou (`promptTokens`, `completionTokens`, `totalTokens` e, com cache, `cacheReadInputTokens`/`cacheWriteInputTokens`), lidos do `Usage` da `ChatResponse` do Spring AI.
- Assistente (ASVS 16.2.1): as linhas da trilha do turno (`ai.turn.started`, `ai.turn.ended`) eram gravadas como `SYSTEM`, sem IP e sem id de requisição, porque o turno roda em outra thread. Agora saem com origem `REST`, o IP da pessoa e o `X-Request-Id` como correlação; as das tools seguem `AI_TOOL` com o id da conversa e passam a ter o IP. O MDC (`http.request.id`, `client.ip`) é copiado para a thread do turno e para cada tool call.
- Assistente (LGPD art. 6 III, ASVS 14.2.4): a trilha não guarda mais os argumentos das tools (`ai.tool.executed`, `ai.tool.failed`, `ai.action.parked`), que ficavam 5 anos enquanto `ai_pending_action` os apaga em 90 dias. Ficam os nomes dos argumentos e o SHA-256 do JSON canônico (`argumentNames`, `argumentsSha256`, `ToolArguments`), que confere com a ação pendente enquanto ela existir.
- Assistente: confirmar uma ação cuja tool deixou de existir deixava a ação em `EXECUTING` para sempre; agora ela vira `FAILED`, com nota na conversa e `ai.action.failed` na trilha.
- Assistente (OWASP LLM06): enquanto uma `@ReadOnlyTool` roda, uma transação nova e gravável aberta pelo código que ela chama (`REQUIRES_NEW`, `TransactionTemplate`) é recusada (`ReadOnlyToolTransactionGuard`, um `TransactionExecutionListener` do Spring). Limites do que não é visto em `docs/ai-agent.md`.
- `os.ai.max-user-message-length` passa a valer (antes era ignorado e valia a constante 4000); teto de 32000, que é também o limite validado no corpo da requisição.
- Aviso de recuperação e de troca de credencial (NIST SP 800-63B-4: "account recovery SHALL cause a notification to be sent to the subscriber or their designee, as described in Sec. 4.6"): usar um código de recuperação, concluir a redefinição de senha pelo link e trocar a senha mandam um aviso sem link, depois do commit (`AccountLinkMailer.SecurityNotice`, `AccountNotifier.sendSecurityNotice`).
- E-mail secundário para avisos de segurança (NIST SP 800-63B-4: "CSPs SHALL support at least two notification addresses per subscriber account"): `users.notification_email` (`V18`), definido pela pessoa em Configurações > Segurança (`PUT /api/me/notification-email`) com reautenticação completa (senha no corpo e, com segundo fator, um dos últimos 15 minutos); e-mail válido e diferente do de acesso. Todos os avisos vão aos dois endereços; links de convite e de redefinição só ao e-mail de acesso. Trocar ou remover avisa o e-mail de acesso, o novo e o anterior. Entra na exportação de dados (`account.notificationEmail`) e é apagado na anonimização. `GET /api/me` devolve `notificationEmail`.
- Códigos de recuperação com 15 caracteres em três grupos de cinco (`xxxxx-xxxxx-xxxxx`, cerca de 74 bits): o NIST SP 800-63B-4 pede para "saved recovery codes" "at least 64 bits from an approved random bit generator", e os de 10 caracteres tinham cerca de 49,5. A `V18` apaga os emitidos antes.
- Sessão renovada na reautenticação (ASVS 5.0 7.2.4, "including re-authentication"): a senha digitada de novo para confirmar uma mudança (configurar ou desativar o aplicativo, gerar códigos, opções e remoção de passkey, trocar a senha, conceder a role de sistema, e-mail secundário), quando confere, troca o id da sessão (`LoginAttempts.confirmPassword`). O token CSRF continua valendo.
- Sessão de conta sem senha cai na hora (ASVS 7.4.1, 7.4.3): depois que o administrador redefine o segundo fator (o que invalida a senha), a próxima requisição da sessão já é recusada, sem esperar o listener que apaga as sessões (`RefreshingSecurityContextRepository`).
- Mudanças de fator travam a linha do usuário antes de contar os fatores (`MfaService.lock`): duas remoções em paralelo não deixam mais sem fator uma conta que a política exige.
- Passkey aceita no segundo passo zera o contador de códigos errados da sessão, como um código aceito.
- Campos de senha aceitam até 512 unidades UTF-16 na API (login incluído) e no portal (4 × 128): o limite que vale é o da política, 128 caracteres Unicode, com a mensagem dela.
- Mensagens de segundo fator pendente ou vencido sem citar o aplicativo autenticador ("Confirme com o seu segundo fator…"), que não serve para conta só com passkey. Web: o cadastro da passkey (`POST /api/me/passkeys`) também passa pela reconfirmação.
- `docs/security-baseline.md`: o HSTS vale em todos os perfis, nas requisições seguras (o texto dizia só no `prod`).
- O e-mail de segundo fator redefinido tinha tabulações no lugar das quebras de linha do texto; corrigido.

### Ação necessária no fork

- Primeira versão; nada a migrar.
- CD: defina a variável `DEPLOY_URL` (`https://<OS_DOMAIN>`), conferida depois de cada deploy. A variável `DEPLOY_PATH` não é mais usada (o caminho fica no `authorized_keys` do servidor). Prepare o servidor com `deploy/ansible/provision.yml`, que amarra a chave do CD a `deploy/ci-deploy.sh`; uma chave instalada sem o comando forçado continua com shell no servidor.
- `POST /api/me/mfa/setup` passa a exigir `{"currentPassword": "..."}`. O id da sessão muda depois de `POST /api/auth/mfa`, `POST /api/me/mfa/confirm` e `POST /api/me/password`: o navegador segue o novo cookie sozinho, mas um cliente próprio precisa ler o `Set-Cookie`. A exportação `GET /api/me/data` devolve `audit` como `{events, truncated}`. `GET /api/audit/activity` responde 400 (antes 422) para fuso desconhecido ou com deslocamento fixo.
- A migração `V11` tira das roles personalizadas as permissões que passaram a ser reservadas (registrado na auditoria). Quem dependia delas passa a pedir ao administrador. Cliente de API que usava `PATCH /api/iam/users/{id}` com `roleIds` passa a usar `PUT /api/iam/users/{id}/roles`. Tenha dois administradores ativos.
- Deploy: defina `DEPLOY_HOST_KEY` e `OS_IMAGE_REPOSITORY`; gere um par de chaves `age` para o backup (`BACKUP_AGE_RECIPIENT`); em produção `OS_APP_BASE_URL` passa a ser obrigatório (o Compose já o define a partir de `OS_DOMAIN`).
- `V12`/`V13` criam `pg_trgm` (extensão confiável: o dono do banco pode criá-la) e reconstroem os índices da auditoria sem bloquear escrita; com milhões de eventos a primeira subida demora (45 s para 3 milhões). Se falhar, veja "Se uma migration de índice falhar" em `docs/performance.md`. Cliente de `GET /api/audit/events` passa de `page`/`sort` e `PagedModel` para `after`/`before`/`oldest` e `{content, next, previous, total, totalExact}`; `actorEmail` exige 3 caracteres ou mais.
- Revisão de 2026-10-02: todo usuário cadastra um segundo fator no próximo login (ou defina `os.iam.mfa.require-for-all: false` com `os.iam.password.min-length` 15 ou mais). Produção exige `SPRING_MAIL_HOST` e `OS_MAIL_FROM`. Rode `deploy/init-secrets.sh` para criar `db_superuser_password`, `db_owner_password`, `db_app_password` e `bootstrap_admin_password` (`db_password` e `OS_BOOTSTRAP_ADMIN_PASSWORD` deixam de existir). `os.iam.lockout.duration` virou `wait-increment` (mais `max-wait`, `failure-reset` e `permanent-after`). Códigos de recuperação emitidos antes da `V14` deixam de valer: quem tinha precisa gerar novos. `@Destructive` virou `@RequiresConfirmation`, e toda `@Tool` de leitura leva `@ReadOnlyTool`. `MfaStatus` ganhou `totp` e `passkeys`. `POST /api/iam/users/{id}/mfa/reset` pode responder 403 `urn:os:problem:mfa-reverification-required`.
- Revisão de 2026-10-02 (continuação): `POST /api/me/mfa/disable` recebe só `{"currentPassword": "..."}`. Com segundo fator, `POST /api/me/mfa/setup`, `/confirm`, `/disable`, `/recovery-codes`, `POST /api/me/passkeys/options`, `POST /api/me/passkeys`, `DELETE /api/me/passkeys/{id}`, `POST /api/me/password` e `DELETE /api/me/sessions` (e `/{id}`) podem responder 403 `urn:os:problem:mfa-reverification-required`: o cliente pede o fator de novo (`POST /api/auth/mfa` ou `/api/auth/mfa/passkey`) e repete. Em HTTPS os cookies passam a se chamar `__Host-OS_SESSION` e `__Host-XSRF-TOKEN`: todos precisam entrar de novo, e um cliente próprio que lê o cookie CSRF procura o nome novo. A `V17` põe `UNIQUE` em `user_entities.name` e falha se houver nomes repetidos. Uma implementação própria de `AccountNotifier` precisa implementar `sendSecondFactorReset` e `sendSecondFactorChanged`. `os.iam.password.max-length` acima de 128 impede a subida. Uma tool `@ReadOnlyTool` cujo use case usa `REQUIRES_NEW` ou `NOT_SUPPORTED` impede a subida. Se o sistema de logs do cliente não aceita ECS, troque `logging.structured.format.console` (`logstash` ou `gelf`). Combine com o encarregado (DPO) o período e a frequência de `db/retention/audit-retention.sql`. Instalações existentes: rode uma vez o `chown` dos volumes do Caddy e o SQL de revogação de `PUBLIC` (`docs/deploy.md`, "Atualização").
- Segredos saem do `.env`: rode `deploy/init-secrets.sh` e mova para `deploy/secrets/` os valores de `POSTGRES_PASSWORD` (`db_password`), `ANTHROPIC_API_KEY` (`anthropic_api_key`), `OS_MFA_ENCRYPTION_KEY` (`mfa_encryption_key`) e `SPRING_MAIL_PASSWORD` (`mail_password`), sobrescrevendo os gerados se a instância já existia.
- Assistente: quem lia `details.arguments` das linhas `ai.tool.*` e `ai.action.parked` da trilha passa a ter `argumentNames` e `argumentsSha256`. Uma tool `@ReadOnlyTool` cujo código chamado abre transação gravável própria passa a falhar (antes gravava). O `RateLimiter` mudou de pacote (`com.maximusflow.os.common`). Ajuste `os.ai.turns-per-minute` e `os.ai.max-user-message-length` se o padrão não servir.
- Deploy atrás de balanceador de carga: troque `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` no `.env` por `OS_TRUSTED_PROXIES` com as faixas CIDR do balanceador (`docs/deploy.md`, "Como o tráfego flui").
- Recuperação e avisos: códigos de recuperação emitidos antes da `V18` deixam de valer (quem tem segundo fator gera novos em Segurança). Uma implementação própria de `AccountNotifier` precisa implementar `sendSecurityNotice`; os avisos de segurança vão também ao e-mail secundário, quando a pessoa cadastra um. O id da sessão muda também depois de toda confirmação de senha (`POST /api/me/mfa/setup`, `/disable`, `/recovery-codes`, `POST /api/me/passkeys/options`, `DELETE /api/me/passkeys/{id}`, `PUT /api/me/notification-email`, concessão da role de sistema): um cliente próprio lê o `Set-Cookie`. `PUT /api/me/notification-email` pode responder 403 `urn:os:problem:mfa-reverification-required`.
