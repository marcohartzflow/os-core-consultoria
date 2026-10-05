# Onde paramos (2026-10-04)

Estado do trabalho no `develop`. O que já foi feito, em detalhe, está em [`feito.md`](feito.md); a lista por versão, no `CHANGELOG.md`.

## Estado do repositório

- Tudo commitado no `develop` e enviado ao GitHub; o CI passa. Não há trabalho local pendente.
- PR `develop` → `main` aberto, esperando revisão e merge. No `os-core` o merge só roda o CI: as imagens e o deploy do `cd.yml` dependem da variável `DEPLOY_HOST`, que só existe no repositório de um cliente.
- O trabalho reúne sete frentes, feitas nesta ordem:
  1. Configurações em janela (popup no estilo do Claude).
  2. Preset do shadcn (`b5KafGdxA`, menu do usuário com cor padrão no tema claro).
  3. Desempenho das listagens (auditoria por posição, índices, totais pré-somados, UUIDv7).
  4. Revisão de usuários, roles, permissões e auditoria (API e web), de 2026-09-30.
  5. Revisão de segurança de 2026-10-02 (OWASP ASVS 5.0 nível 2 e NIST SP 800-63B-4 AAL2).
  6. Fluxo de deploy e continuidade do cliente (2026-10-02): CD que roda o CI antes, chave do CD presa a `deploy/ci-deploy.sh`, playbook Ansible da VPS, `deploy.md` e `fork.md` reescritos; depois da pesquisa de padrões: `up --wait` e conferência de `/api/health` depois do deploy, `zizmor` e Grype no CI, regra de migração em paralelo. A varredura achou CVEs críticas no Tomcat e no BouncyCastle e altas no Jackson, no OpenSSL do Temurin e no npm da imagem do web, corrigidas.
  7. Teste no navegador dos fluxos novos (2026-10-04), com três correções pequenas (abaixo).

## O que foi feito (2026-10-02)

A lista completa está no CHANGELOG, em "Revisão de 2026-10-02", com o que um fork precisa fazer em "Ação necessária no fork". O estado resultante está em `docs/security-baseline.md`. Em resumo:

- Autenticação: segundo fator obrigatório para todos, com passkey ao lado do aplicativo autenticador, no modelo de multi-factor do Spring Security 7. Id de sessão com 256 bits. Cookies `__Host-` em HTTPS. Reautenticação completa (ASVS 7.5.1 e 7.5.2): mudar fatores, trocar a senha e encerrar as próprias sessões pedem um segundo fator dos últimos 15 minutos, mais a senha onde a requisição a tem. E-mail quando um fator muda. Códigos de recuperação com Argon2id, também em conta só com passkey. TOTP só no passo atual. Lockout no modelo do Keycloak, que conta também passkey recusada.
- Logs: JSON (ECS) em produção com id da requisição e IP em cada linha; o id volta em `X-Request-Id` e é o `correlationId` da trilha. Negações com a regra que negou.
- Assistente: falha de tool sem detalhe interno para o modelo; `@ReadOnlyTool` em transação somente leitura; ações vencidas expiram sozinhas e as resolvidas somem em 90 dias; `audit_search` sem IP.
- LGPD: a exportação traz tarefas e ações propostas; `audit-retention.sql` para a retenção da trilha.
- Web: reconfirmação do segundo fator em todas as ações de segurança, `base-uri 'none'`, armazenamento limpo também quando a sessão expira, erro inesperado com texto genérico.
- Deploy: roles de banco separados, revogação de `PUBLIC`, redes Docker separadas, Caddy sem root, Postgres com sistema de arquivos somente leitura, rotação de logs, SMTP obrigatório, backup e restauração atômicos (backup truncado é recusado), `TRACE` recusado, IP real do cliente atrás de balanceador (`OS_TRUSTED_PROXIES`).
- Segunda rodada da auditoria final, também corrigida: avisos por e-mail no uso de código de recuperação, na redefinição e na troca de senha; segundo endereço para avisos (NIST); códigos de recuperação com 15 caracteres (~74 bits); sessão encerrada na hora quando a senha é revogada; id de sessão novo a cada senha reconfirmada; limite de 20 turnos por minuto no assistente e tokens registrados (`ai.turn.ended`); argumentos de tools na trilha só como nomes e hash.

Verificações que passaram:

- API: 131 testes verdes (build limpo), incluindo `DatabaseRolesTests`, que roda o `postgres-roles.sh` num PostgreSQL 18.
- Pilha inteira com `docker compose` num ambiente local de teste: `migrate` aplicou as migrations e saiu com 0; api e web saudáveis; logs ECS com IP; Caddy como uid 10001; web sem saída para a internet; cookies `__Host-`; CSP, COOP, CORP e HSTS conferidos; login pedindo o cadastro do segundo fator. Rodada antes das últimas correções de deploy (proxy confiável, `TRACE`, Postgres read-only, restore), que foram testadas uma a uma em containers.
- Web: `check-types`, `lint` e `build` verdes.
- Contratos (`packages/contracts`) gerados de novo a partir do OpenAPI.

- Ensaio de ponta a ponta do deploy (2026-10-02), num Ubuntu 24.04 com 2 vCPU e 4 GB preparado pelo playbook, com um registry no papel do `ghcr.io` (TLS e login), o deploy disparado pela chave do CD (comando forçado) e o próprio `cd.yml` executado pelo `act`:
  - Primeira instalação (pelo roteiro de "Entrada em produção") em 28 s; deploys seguintes em 22 a 29 s, com o portal fora de 7 a 13 s (era de 15 a 21 s, com picos de 30 s: a migração rodava de novo com a API parada e o web parava junto com ela; agora a migração roda uma vez, com a versão antiga no ar, e API e web reiniciam um de cada vez, com health check a cada segundo enquanto sobem).
  - Migração quebrada: o deploy falha em 8 s com status 1, o Flyway desfaz a transação e o portal segue no ar na versão anterior (nenhuma falha na sonda); o `.env` continua apontando a versão que roda.
  - Dez deploys seguidos: ficam no servidor só as imagens das três últimas versões implantadas. Rollback para versão com imagem no servidor e para versão já apagada (baixa de novo): os dois funcionam.
  - Teste mensal de restauração: passa (21 tabelas, migração 18, 1 usuário), falha com status 1 quando o banco está parado, não deixa container para trás; a linha do cron roda como o cron roda.
  - `/api/health`: só `{"status":"UP"}`; com o banco fora, 503 em 5 s (era 500 em 30 s); 50 chamadas seguidas viram 10 transações no banco (cache de 5 s).
  - Reinício automático configurado (`Automatic-Reboot` às 04:00, conferido com `apt-config dump`); o reinício em si não roda num container de teste.
  - `cd.yml` pelo `act`: rollback pelo Run workflow (CI e imagens pulados, deploy e conferência do portal verdes); SHA fora da `main`, entrada que não é SHA e host key errada recusados; portal que não responde deixa o job vermelho (em cerca de 3 min, pelas novas tentativas); CI vermelho num push não chega às imagens nem ao deploy. O job do `zizmor` rodou como no GitHub e achou falta de `cooldown` no Dependabot (corrigido); o job `deploy-scripts` (`shellcheck` e `ansible-lint`) rodou verde depois de corrigir um achado no `backup.sh`.
  - Restauração do backup seguindo o `deploy.md`: dados iguais, login funcionando. "Entrada em produção" seguida ao pé da letra: segredos novos, login com a senha nova.
  - Linha do cron executada como o cron executa; backup no journal. Docker reiniciado: portal de volta em 10 s. Playbook rodado de novo com o portal no ar: nada muda, portal segue no ar.
  - Só 22, 80 e 443 escutando; containers sem root (exceto o entrypoint do Postgres), raiz somente leitura, sem novos privilégios.
  - Carga (20 conexões, 20 s, pela cadeia inteira com TLS): `/api/health` 2.366 req/s (p99 32 ms), `/login` 476 req/s (p99 73 ms), `/api/auth/csrf` 5.191 req/s (p99 12 ms), sem erro. Login com Argon2id em 40 a 55 ms; e-mail inexistente em 66 ms. Memória: API 540 MB, web 114 MB, Postgres 40 MB, Caddy 20 MB.

## Testes no navegador (2026-10-04)

Pilha local (`pnpm api` com o perfil `local`, `pnpm dev`), no Chrome; a passkey num Chromium com o autenticador virtual do DevTools (Playwright, domínio WebAuthn), e os e-mails pelo Mailpit. Passaram:

- Primeiro login do administrador: troca de senha obrigatória, depois o cadastro do segundo fator (senha atual, QR code, código do aplicativo), 10 códigos de recuperação mostrados uma vez; o portal só abre depois.
- Login com código de recuperação: o código vale uma vez (reusado, é recusado), aviso por e-mail e registro na trilha. Código errado é recusado.
- Segundo endereço de avisos: salvo com a senha, os dois endereços avisados.
- Gerar novos códigos: pede a senha, os antigos deixam de valer, aviso nos dois endereços.
- Passkey: cadastro como primeiro fator, login pela passkey, remoção recusada quando é o único fator ("A política exige segundo fator") e aceita depois de cadastrar o aplicativo autenticador; aviso por e-mail no cadastro e na remoção.
- Sessões: encerrar outra sessão pela tela; a sessão encerrada passa a receber 401.
- Convite: sem SMTP o link aparece na tela; com SMTP a API não devolve o link e ele chega por e-mail; aberto do e-mail, ativou a conta. Senha com parte do e-mail recusada.
- Redefinição do segundo fator pelo administrador: depois de 15 min pede o código do administrador (step-up); apaga o fator e a senha (a antiga dá 401); o link de nova senha vai por e-mail; com a senha nova, a pessoa cai no cadastro do segundo fator.
- E-mails pelo SMTP (Mailpit): convite, redefinição de senha, redefinição do segundo fator e avisos de fator, nos dois endereços.

Corrigido depois dos testes:

- Erros de regra (`422`) mostravam o título "Regra de negócio" acima da mensagem; agora "Não foi possível concluir".
- Sem SMTP, a redefinição do segundo fator dizia "Enviamos um link"; agora diz que o link ficou no log da API. A API responde `{emailed}` e nunca devolve o link ao administrador.
- O bloco de e-mail local do `application-local.yml.example` não funcionava descomentado (chaves repetidas, SMTP com login e STARTTLS); corrigido e testado com o Mailpit.

## O que falta

Nada de código. O que resta depende de um servidor de cliente ou de uma decisão do usuário ou do cliente.

### Revisão e merge (usuário)

1. Revisar e fazer o merge do PR `develop` → `main`.

### No primeiro cliente (com a VPS, o domínio e o repositório do cliente)

O roteiro está em `docs/fork.md` (repositório, variáveis, chaves) e `docs/deploy.md` ("Preparar o servidor", "Entrada em produção"). Tudo foi ensaiado num Ubuntu 24.04 em container e com o `act`; falta rodar com os serviços reais:

2. Playbook do Ansible na VPS.
3. Primeiro push na `main` do cliente: CI, imagens no `ghcr.io`, deploy por `ci-deploy.sh`, conferência de `/api/health`, certificado do Let's Encrypt.
4. Um rollback de teste pelo Run workflow com o SHA anterior.
5. Conferir no servidor: cookies `__Host-` em HTTPS, um SMTP de verdade (convite e redefinição), `timedatectl` (em container o `systemd-timesyncd` não sobe) e uma passkey num aparelho real (Touch ID ou celular).

### Depende do usuário ou do cliente

- A chave da API da Anthropic. Sem ela o assistente não foi testado de ponta a ponta.
- O e-mail real de contato de segurança no `SECURITY.md`.
- A decisão sobre a transferência internacional de dados pessoais à Anthropic (LGPD art. 33). É contratual, do cliente; está registrada como risco aceito na seção 9 de `security-baseline.md`.
- Os itens que dependem da infraestrutura do cliente (`security-baseline.md`, seção 9): logs num sistema separado, cofre de segredos, firewall de saída no host, destino do backup, backup e snapshot do provedor, e a resposta escrita da Hostinger sobre criptografia do disco.
- Opcional: tirar `zizmorcore/zizmor-action@*` da lista de actions permitidas do repositório (não é mais usada).

## Ambiente local depois dos testes

- O banco local de desenvolvimento tem o administrador (`admin@example.com`, com a senha trocada no primeiro login e o segundo fator cadastrado) e três usuários de teste (`teste@example.com`, `convite-smtp@example.com`, `passkey2@example.com`). Para começar do zero, apague o volume `postgres-data` de `apps/api/compose.yaml`; para dados de demonstração, `pnpm demo:data`.
- Para testar e-mails, use o bloco do Mailpit em `application-local.yml.example`.
- Para testar passkeys sem um aparelho, use o painel WebAuthn do DevTools do Chrome (More tools, WebAuthn, "Enable virtual authenticator environment").
