# O que foi feito (2026-09-29 a 2026-10-02)

As cinco frentes que estão na pasta de trabalho, ainda sem commit. Onde paramos e o que falta: [`onde-paramos.md`](onde-paramos.md). O CHANGELOG (`[Unreleased]`) traz as mesmas mudanças, incluindo o que um fork precisa fazer.

## 1. Configurações em janela

A antiga tela "Minha conta" virou uma janela de Configurações, no estilo do Claude. As telas de Administração continuam como páginas.

- Ela é montada com o bloco `sidebar-13` do shadcn e só usa componentes e tokens do shadcn, então trocar o preset continua mudando tudo.
- Abre pelo menu do usuário, pela busca (⌘J) ou por ⌘,. As seções são Geral (tema), Perfil, Segurança (senha e segundo fator), Sessões e Privacidade.
- Arquivos novos em `apps/web/src/core/settings/`:
  - `SettingsDialog.tsx`: o provider com o atalho e `useOpenSettings`.
  - `sections.tsx`.
  - `SettingsSection.tsx`.
  - `SettingsLock.tsx`: impede fechar a janela enquanto os códigos de recuperação estão na tela.
- `/account` só redireciona para a janela.
- O bloqueio de conta (troca de senha obrigatória, segundo fator obrigatório) é desenhado pelo `AppShell`, com a seção de Segurança e o botão de sair.

## 2. Preset do shadcn

- O preset `b5Jz9wgOe` foi testado e revertido.
- O preset atual é `b5KafGdxA`, com `menuColor: default`. Antes o menu do usuário ficava escuro e translúcido no tema claro.
- `components/ui/dropdown-menu.tsx` e `select.tsx` foram regenerados pela CLI, nunca editados à mão.
- O `docs/stack.md` registra o preset.

## 3. Desempenho das listagens

Medido com 3 milhões de eventos de auditoria, 5 mil pessoas e 200 mil tarefas, pela API real, antes e depois. Os detalhes estão em `docs/performance.md`, e o kit de medição em `scripts/perf/`.

| Cenário | Antes | Depois |
|---|---:|---:|
| Auditoria, primeira página | 153 ms | 14 ms |
| Auditoria, 100 mil eventos atrás | 179 ms | 13 ms |
| Auditoria, e-mail contém | 628 ms | 43 ms |
| Painel, atividade de 90 dias | 143 ms | 13 ms |
| Tarefas, busca | 109 ms | 17 ms |

Custo: a tabela de auditoria passou de 914 MB para 1,68 GB por causa dos índices. A escrita ficou mais rápida, porque os ids UUIDv7 são ordenados pelo tempo.

O que mudou:

- **Paginação por posição.** `GET /api/audit/events` responde `{content, next, previous, total, totalExact}`, e a contagem para em 10.000.
- **Índices** compostos, trigram e parciais, criados sem bloquear a escrita: V13, com `executeInTransaction=false`.
- **Totais do painel** pré-somados a cada 15 minutos (V12, `audit_activity_bucket`).
- **UUIDv7** em todas as entidades. A chave primária da auditoria passou a ser `(id, occurred_at)`, já pensando em particionar.
- **Conexões:**
  - Toda consulta é planejada com os valores reais (`plan_cache_mode = force_custom_plan`).
  - `statement_timeout` de 15 s no pool.
  - Log de consultas lentas.
  - Paginar trazendo coleções vira erro.
- **Web:**
  - Navegação por posição na auditoria.
  - Filtro "Quem" escolhe a pessoa; "e-mail contém" fica para endereços sem conta e exige 3 caracteres.

## 4. Revisão de usuários, roles, permissões e auditoria

Quatro revisões em paralelo, comparando o código com a documentação oficial:

- Infraestrutura do web e cada `useEffect`.
- Telas de administração.
- API de auth e IAM: Spring Security, OWASP.
- API de auditoria, infraestrutura comum e migrations.

Todo achado foi conferido no código antes de corrigir. A lista completa está no CHANGELOG, em "Revisão de 2026-09-30". Os pontos principais:

**Segurança (API)**

- Um novo login com a senha zerava o contador de códigos errados do segundo fator, então o bloqueio podia ser contornado. Agora o contador só volta a zero no login completo (`LoginAttempts`).
- A senha digitada para confirmar uma mudança conta no bloqueio, e conta bloqueada não confirma nada. Isso vale para trocar a senha, ativar ou desativar o segundo fator e conceder administrador. Ativar o segundo fator agora pede a senha.
- Contas bloqueadas, desativadas ou convidadas respondiam mais rápido no login. Agora toda tentativa calcula o Argon2id.
- O id da sessão muda depois do segundo fator e da troca de senha, e o token CSRF muda no login.
- Corridas:
  - `@DynamicUpdate` em `User`.
  - Contador de falhas com a linha travada.
  - Mínimo de administradores com a role de sistema travada.
  - 409 para violação de integridade, em vez de 500.
- Convite de conta desativada não ativa mais a conta. Encerrar sessões de outra pessoa exige poder gerenciá-la e não vale para a própria conta.
- O log de segurança grava o id ou o e-mail mascarado. Logout, bloqueio e acesso negado entram no log.
- Permissões que passam a ser reservadas saem das roles personalizadas na subida seguinte.
- Tempo limite na verificação de senha vazada. As configurações `os.iam.*` e `os.auth.*` são validadas na subida.

**Auditoria e LGPD**

- A exportação dos dados pessoais não era registrada na trilha (estava numa transação somente leitura). Agora é, e o gravador recusa transação somente leitura.
- A exportação dos dados pessoais passou a incluir os eventos sobre a conta e as tentativas com o e-mail da pessoa, e indica quando foi cortada.
- O CSV grava o registro na trilha antes de enviar o arquivo, e a neutralização de fórmulas ficou completa.
- As conexões usadas pelas migrations são descartadas depois (`FlywayConfig`).
- Fuso com deslocamento fixo é recusado. Datas fora do intervalo dão 400. A V13 pode rodar de novo com segurança.

**Web**

- Redirecionamento aberto no login (`next=/%09/site.com`) corrigido.
- Com o segundo fator pendente, nenhuma outra tela monta.
- Os códigos de recuperação não somem.
- Downloads mostram o erro.
- Respostas antigas não sobrescrevem as novas (`useLoad`, `/api/me`).
- `global-error`, `error` nas telas públicas e `loading.tsx`.
- O formulário de convite limpa ao cancelar. Mudar o próprio acesso atualiza o portal.
- Acessibilidade e textos.
- Cada `useEffect` foi avaliado. A maioria está correta, porque sincroniza com algo externo (URL, teclado, timer) e limpa o que cria. Duas buscas manuais passaram para `useLoad`.

**Testes novos ou ampliados**

- Bloqueio do segundo fator entre logins.
- Senha errada ao confirmar uma mudança conta no bloqueio.
- Convite de conta desativada.
- Encerrar as próprias sessões pela tela de usuários.
- Registro da exportação de dados pessoais.
- CSV com caracteres de largura total.
- Fuso com deslocamento fixo.
- Empate de horário na fronteira entre páginas.

**Mudanças de contrato** (também em "Ação necessária no fork" no CHANGELOG):

- `POST /api/me/mfa/setup` exige `{currentPassword}`.
- O id da sessão muda depois do segundo fator e da troca de senha. O cliente precisa seguir o `Set-Cookie`.
- `GET /api/me/data` devolve `audit` como `{events, truncated}`.
- `GET /api/audit/activity` responde 400 para fuso inválido.

## 5. Revisão de segurança de 2026-10-02

Padrão: OWASP ASVS 5.0 nível 2 e NIST SP 800-63B-4 AAL2, cada decisão com fonte oficial ou projeto de produção. A lista completa está no CHANGELOG, em "Revisão de 2026-10-02"; o estado resultante está em `docs/security-baseline.md`.

Resolveu as pendências deixadas de propósito na revisão de 2026-09-30, menos particionar a auditoria:

- O limite de sessões simultâneas só conta logins completos e roda quando o segundo fator é aceito.
- O pedido de redefinição de senha faz o mesmo trabalho para qualquer e-mail e emite o link depois de responder.
- Convite e links saem depois do commit, com reenvio se o SMTP falhar.
- A chave de MFA só cifra o segredo TOTP; os códigos de recuperação usam Argon2id. A falta de AAD na cifra ficou como risco aceito.
- Tokens usados ou vencidos são apagados por um job.
- A trilha de auditoria fica imutável também para quem tem as credenciais da API (roles de banco separados).
- As telas cancelam requisições que ficaram para trás (`AbortController`).

Além disso: segundo fator obrigatório para todos, passkeys, step-up, lockout no modelo do Keycloak, política de senha por code points e palavras do contexto, falha de login na trilha sem o e-mail digitado, `@ReadOnlyTool`/`@RequiresConfirmation` em toda tool de IA, limpeza do arquivo de eventos e cabeçalhos COOP/CORP no web.

Depois, no mesmo dia:

- Sessão e reautenticação: id de sessão com 256 bits (`V17`), cookies `__Host-` em HTTPS, step-up de 15 minutos para mudar fatores, trocar a senha e encerrar as próprias sessões (ASVS 7.5.1 e 7.5.2), e-mail quando um fator muda, códigos de recuperação em conta só com passkey, TOTP só no passo atual, passkey recusada no lockout.
- Logs JSON (ECS) com id da requisição e IP; negações com a regra que negou.
- Assistente: falha de tool sem detalhe interno, `@ReadOnlyTool` em transação somente leitura, limpeza das ações propostas, `audit_search` sem IP.
- LGPD: tarefas e ações propostas na exportação; `audit-retention.sql`.
- Web: reconfirmação em todas as ações de segurança, `base-uri 'none'`, erro inesperado com texto genérico.
- Deploy: redes Docker separadas, Caddy sem root, revogação de `PUBLIC` no Postgres (`DatabaseRolesTests`), rotação de logs, backup e restauração atômicos.
- `security-baseline.md` revisada de ponta a ponta, com inventário criptográfico e a lista do que depende da infraestrutura do cliente.
