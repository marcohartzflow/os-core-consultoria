# OS Core

Base a partir da qual a Maximus Flow desenvolve o "OS" de cada cliente: um portal único que centraliza os sistemas da empresa e é operável por um agente de IA que respeita as permissões do usuário logado.

- Arquitetura e decisões: [`docs/architecture.md`](docs/architecture.md)
- Stack, versões e documentação oficial: [`docs/stack.md`](docs/stack.md)
- Segurança, auditoria e LGPD: [`docs/security-baseline.md`](docs/security-baseline.md)
- Agente de IA: [`docs/ai-agent.md`](docs/ai-agent.md)
- Como criar um módulo de negócio: [`docs/new-module.md`](docs/new-module.md)
- Deploy em um servidor (Compose + Caddy): [`docs/deploy.md`](docs/deploy.md)
- Fork por cliente e manutenção mensal: [`docs/fork.md`](docs/fork.md)

## Estrutura

```
apps/api   Spring Boot 4.1 (Java 25, Gradle)  ->  http://localhost:8080
apps/web   Next.js 16 (App Router)            ->  http://localhost:3000, repassa /api/* para o Spring
packages/  pacotes compartilhados (contracts gerados do OpenAPI)
deploy/    Compose, Caddyfile e backup para instalar um OS em um servidor
docs/      documentação de arquitetura e conformidade
```

## Requisitos

- Docker (Postgres sobe via `compose.yaml` automaticamente no `bootRun` e nos testes via Testcontainers)
- JDK 17 ou superior no host para rodar o Gradle. O JDK 25 do toolchain é baixado automaticamente.
- Node.js 24 e pnpm 11 (`corepack enable` respeita o campo `packageManager`)

## Rodando

```bash
pnpm install

# API (sobe o Postgres do compose.yaml)
pnpm api

# Web
pnpm dev
```

Copie `apps/api/src/main/resources/application-local.yml.example` para `application-local.yml`, preencha `ANTHROPIC_API_KEY` e os dados do primeiro administrador (`os.iam.bootstrap.*`), e rode com `SPRING_PROFILES_ACTIVE=local`. O primeiro admin é criado só quando a tabela de usuários está vazia. Depois, convide os demais em Administração > Usuários; sem servidor de e-mail configurado, o link do convite aparece na resposta e no log da API.

Interface: shadcn/ui com presets. Componentes novos entram com `pnpm dlx shadcn@latest add <componente>` em `apps/web`; a identidade visual inteira troca com `pnpm dlx shadcn@latest apply --preset <codigo>`. Detalhes e regras em `docs/stack.md`.

## Testes

```bash
pnpm api:test       # Gradle: testes de integração com Testcontainers + verificação de módulos (Spring Modulith)
pnpm check-types    # TypeScript
pnpm lint
pnpm build
```

Colima no macOS: o Ryuk do Testcontainers precisa do caminho do socket dentro da VM. O `build.gradle.kts` já define `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` para o task `test`, então funciona no terminal, no IntelliJ e no CI sem configuração extra (referência: https://java.testcontainers.org/supported_docker_environment/). No Testcontainers 2 essa opção só existe como variável de ambiente; `~/.testcontainers.properties` não a aceita.

## Regras de ouro

1. Código de módulo core (`common`, `auth`, `iam`, `ai`) nunca importa módulo de cliente. O teste `ModularityTests` garante.
2. Fork de cliente nunca edita módulo core; personaliza por extension points e módulos próprios. Isso mantém o `git merge upstream/main` limpo.
3. Todo use case é anotado com `@RequiresPermission`. Se também for `@Tool`, o agente passa a operá-lo com a permissão do usuário.
