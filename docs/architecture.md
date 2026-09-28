# Arquitetura do OS Core

Este documento registra as decisões de arquitetura do `os-core`, a base a partir da qual cada "OS" de cliente é desenvolvido. Decisões aqui são deliberadas: mudanças exigem atualizar este arquivo.

## 1. Modelo de negócio e o que ele impõe

- A Maximus Flow vende o desenvolvimento e o código. O cliente é dono do fork (`<cliente>-os`) e pode sair a qualquer momento levando tudo.
- ICP: empresas de 10 a 50 funcionários. Um deploy por cliente (single-tenant). Sem autoscaling, sem multi-tenancy no schema.
- Consequências diretas:
  - **Zero dependência em registry privado da Maximus Flow.** Todo o código do core vive dentro do fork. Nada de pacote Maven ou npm publicado só por nós.
  - **Fork + remote `upstream` é o modelo definitivo.** O contrato de manutenção mensal consiste em trazer o `upstream/main` para o fork e validar.
  - **Sessão HTTP no servidor, não JWT.** Revogação imediata, permissão atualizada na próxima requisição, sem refresh token.

## 2. Regras que mantêm o merge com o upstream limpo

1. Código do cliente nunca edita módulos core. Personalização entra por extension points (beans condicionais, `application.yml`, eventos de domínio) ou por módulos próprios do cliente.
2. Módulos core nunca dependem de módulos do cliente. A regra é verificada em teste pelo Spring Modulith (`ModularityTests`), então violação quebra o CI.
3. Se o core precisa mudar para atender um cliente, a mudança nasce no `os-core` e desce por merge.

## 3. Layout do monorepo

```
os-core/
  apps/
    api/                    Spring Boot (Gradle, Kotlin DSL, Java 25)
      src/main/java/com/maximusflow/os/
        OsApiApplication.java
        common/             módulo aberto: erros, segurança, auditoria (gravação e consulta)
        auth/               módulo core: sessão, login, convite, senha
        iam/                módulo core: users, roles, permissions
        ai/                 módulo core: agente, tool registry, confirmação, auditoria de tools
        tasks/              módulo de exemplo: tarefas; modelo para módulos de cliente, removível
        <modulo-cliente>/   módulos de negócio, criados no fork
      src/main/resources/db/migration/   Flyway
      compose.yaml          Postgres para desenvolvimento
    web/                    Next.js 16 (App Router, TypeScript, Tailwind)
      src/app/              rotas
      src/core/             auth, iam, painel de IA, client da API
      src/modules/          negócio do cliente (tasks/ é o exemplo)
    mobile/                 futuro (Expo)
  packages/                 pacotes compartilhados entre web e mobile (ex.: contracts do OpenAPI)
  docs/
```

O `api` é um único módulo Gradle. Fronteiras entre módulos são pacotes Java verificados pelo Spring Modulith, não subprojetos Gradle. Como o código inteiro vai junto no fork, dividir em jars não traria benefício e complicaria o build.

## 4. Backend

### Modular monolith com Spring Modulith

- Cada subpacote direto de `com.maximusflow.os` é um módulo de aplicação.
- `common` é `Type.OPEN`: qualquer módulo pode usá-lo. Ele não depende de nada.
- Módulos core declaram `allowedDependencies` explícitas em `package-info.java`. Um módulo core que tente importar um módulo de cliente falha no `ModularityTests`.
- Módulos de cliente não precisam declarar `allowedDependencies`, mas só podem acessar a API pública dos outros módulos (pacote raiz do módulo ou `@NamedInterface`).
- Comunicação entre módulos que não precisa ser síncrona usa eventos de domínio com o event publication registry (tabela `event_publication`, JDBC). Eventos pendentes são republicados no restart.

### Estrutura interna de um módulo

```
<modulo>/
  <Modulo>Api.java ou records públicos    API pública do módulo (o que outros módulos podem ver)
  package-info.java
  internal/
    web/          controllers finos
    application/  use cases (regra de negócio, transação, autorização)
    domain/       entidades, value objects
    persistence/  repositórios JPA, migrações do módulo
```

Controller não tem regra de negócio. Autorização fica no use case (ver seção 6).

### Persistência

- Spring Data JPA com Hibernate ORM 7 (Jakarta Persistence 3.2), PostgreSQL 18.
- Schema só via Flyway. `spring.jpa.hibernate.ddl-auto=validate`: Hibernate confere, nunca cria.
- `spring.jpa.open-in-view=false`. Carregamento explícito, sem lazy loading escondido no controller.
- Auditoria de linha com `@CreatedBy`, `@CreatedDate`, `@LastModifiedBy`, `@LastModifiedDate` via `AuditingEntityListener` e um `AuditorAware` que lê o usuário da sessão.
- Cada migração de módulo vive em `db/migration` com prefixo do módulo no nome, por exemplo `V5__iam_add_user_status.sql`.

### Sessão e autenticação

- Spring Security guarda a autenticação na `HttpSession` por padrão (`HttpSessionSecurityContextRepository`). Spring Session JDBC persiste a sessão no Postgres (`SPRING_SESSION`, `SPRING_SESSION_ATTRIBUTES`), sobrevive a restart e permite listar e encerrar sessões de um usuário.
- Cookie `OS_SESSION`, `HttpOnly`, `SameSite=Lax`, `Secure` em produção.
- Session fixation protection ativa (padrão `changeSessionId`). Limite de sessões simultâneas configurável por `maximumSessions`.
- Login é `POST /api/auth/login` com JSON. Sucesso responde 200 com o usuário, falha responde 401. Sem redirect.
- CSRF ativo com `csrf.spa()`: token no cookie `XSRF-TOKEN`, enviado pelo front no header `X-XSRF-TOKEN`.
- Não existe registro público. Admin convida por e-mail, o convidado define a senha por link com token de uso único e expiração curta.
- Senha com Argon2id (`Argon2PasswordEncoder`) dentro de `DelegatingPasswordEncoder`, para permitir rotação de algoritmo sem migração manual.

### Uma origem só

O browser só conhece o domínio do Next. O `next.config.ts` reescreve `/api/*` para o Spring. Sem CORS, cookie first-party, SSE do chat funciona com `EventSource` nativo.

## 5. Frontend

- Next.js como frontend puro. Route handlers só se algo exigir BFF, o que não é o caso hoje. `src/proxy.ts` só redireciona pela presença do cookie; autorização é sempre da API.
- Interface inteira sobre shadcn/ui com presets: componentes gerados em `src/components/ui`, identidade visual trocada com `shadcn apply --preset` (ver `stack.md`). Código próprio em `src/core` (auth, shell, iam) e `src/modules` (cliente) só compõe componentes do shadcn e usa tokens semânticos.
- Client TypeScript gerado do OpenAPI do Spring (springdoc em `/api/v3/api-docs`) para `packages/contracts` (fase 3). Até lá, `src/core/api/types.ts` espelha os contratos à mão.
- Shell do portal monta menu a partir de `src/core/shell/navigation.ts` + `src/modules/navigation.ts`, filtrado pelas permissões do usuário (`GET /api/me`). Módulo sem permissão não aparece.
- Painel de IA fixo na lateral, com streaming (fase 3).

## 6. Autorização

- Permissão é string `modulo.recurso.acao`, por exemplo `iam.user.create`.
- Role é um conjunto nomeado de permissões. Usuário tem uma ou mais roles. O conjunto efetivo de permissões do usuário é o que vira `GrantedAuthority` na sessão.
- Anotação `@RequiresPermission("iam.user.create")` é uma meta-anotação de `@PreAuthorize("hasAuthority('{value}')")` e é colocada **no método do use case**, não no controller. Assim REST e agente de IA passam pela mesma verificação.
- Acesso a dados específicos (IDOR) é resolvido no use case ou no repositório, nunca confiando em id vindo do cliente sem checar o dono ou o escopo.
- Autorização negada gera log de segurança com usuário, permissão e recurso.

## 7. Agente de IA

Detalhado em `ai-agent.md`. Resumo: cada use case anotado com `@Tool` e `@RequiresPermission` vira ferramenta do agente; o agente só recebe as tools que o usuário atual pode executar; a mesma anotação bloqueia a execução se o modelo tentar chamar algo fora da lista; ações destrutivas exigem confirmação humana; toda tool call é auditada.

## 8. Fases

1. Feita. Skeleton: monorepo, api gerada pelo Spring Initializr, web gerada pelo `create-next-app`, Postgres via Docker Compose, Flyway, Modulith, CI.
2. Feita. `auth` + `iam`: login por sessão, CSRF, lockout, convite, reset de senha, roles, catálogo de permissões, `@RequiresPermission`, bootstrap do primeiro admin, `GET /api/me`, sessões, trilha de auditoria, shell web com shadcn/ui e telas de usuários, roles e conta.
3. Feita (sem streaming token a token). `ai`: registry por scan de `@Tool` + `@RequiresPermission`, filtro por permissão, enforce no use case, confirmação humana para `@Destructive`, auditoria por tool call com origem `AI_TOOL`, conversas por usuário com memória JDBC, SSE com eventos de tool e ação pendente, painel no front. Pendente: client TypeScript gerado do OpenAPI, streaming de tokens, ações de UI.
4. Feita. Módulo de exemplo `tasks`: use case anotado aparece como REST e como tool (`tasks_list`, `tasks_get`, `tasks_create`, `tasks_complete`, `tasks_delete` destrutiva), tela em `src/modules/tasks`, entrada de menu em `src/modules/navigation.ts`. Guia passo a passo em `new-module.md`.
5. Primeiro cliente: fork com remote `upstream`.
