# OS Core

Base a partir da qual a Maximus Flow desenvolve o "OS" de cada cliente: um portal único que centraliza os sistemas da empresa e é operável por um agente de IA que respeita as permissões do usuário logado.

Documentação completa, com ordem de leitura por público, em [`docs/README.md`](docs/README.md). Como contribuir: [`CONTRIBUTING.md`](CONTRIBUTING.md). Mudanças por versão: [`CHANGELOG.md`](CHANGELOG.md). Reporte de vulnerabilidades: [`SECURITY.md`](SECURITY.md).

## Estrutura

```
apps/api            Spring Boot 4.1 (Java 25, Gradle)  ->  http://localhost:8080
apps/web            Next.js 16 (App Router)            ->  http://localhost:3000, repassa /api/* para o Spring
packages/contracts  tipos TypeScript gerados do OpenAPI da API (consumidos pelo web)
deploy/             Compose, Caddyfile, update, backup e restore para instalar um OS em um servidor
docs/               documentação de arquitetura e conformidade
.github/            CI (testes, contratos, imagens) e CD (só em forks com DEPLOY_HOST)
```

## Requisitos

- Docker (Postgres sobe via `compose.yaml` automaticamente no `bootRun` e nos testes via Testcontainers)
- Qualquer JDK recente no `PATH` só para iniciar o Gradle. O JDK 25 que compila e roda o daemon é baixado sozinho (`apps/api/gradle/gradle-daemon-jvm.properties`, Gradle Daemon JVM criteria). No IntelliJ 2025.1+ isso vale automaticamente: não configure Gradle JVM à mão.
- Node.js 24 e pnpm 11 (`corepack enable` respeita o campo `packageManager`)

## Rodando

```bash
pnpm install

# API (sobe o Postgres do compose.yaml)
pnpm api

# Web
pnpm dev
```

No IntelliJ, abra a raiz do repositório e use a run configuration compartilhada `OsApiApplication` (`.run/`): ela roda com working directory `apps/api`, onde está o `compose.yaml`, e com o perfil `local`.

Copie `apps/api/src/main/resources/application-local.yml.example` para `application-local.yml`, preencha `ANTHROPIC_API_KEY` e os dados do primeiro administrador (`os.iam.bootstrap.*`), e rode com o perfil `local`: `SPRING_PROFILES_ACTIVE=local pnpm api` (a run configuration do IntelliJ já define o perfil). O primeiro admin é criado só quando a tabela de usuários está vazia. Depois, convide os demais em Administração > Usuários; sem servidor de e-mail configurado, o link do convite aparece na resposta e no log da API.

Dados de demonstração: com a API local no ar, `pnpm demo:data` cria roles, 22 pessoas (a maioria aceita o convite e entra uma vez; algumas ficam convidadas ou desativadas) e 28 tarefas com prazos variados, tudo pela API e na auditoria. Pede e-mail, senha e código de duas etapas de um administrador; só aceita `localhost` (`--api http://localhost:8080` por padrão). Rodar de novo não duplica nada. Leva uns 4 minutos por causa do limite de aceites de convite por minuto.

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
