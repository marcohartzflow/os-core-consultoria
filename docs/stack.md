# Stack e documentação oficial

Versões verificadas em 2026-09-28 nas fontes oficiais. Ao atualizar, confira a página de release da própria ferramenta e ajuste aqui.

## Backend

| Componente | Versão | Como foi escolhida | Documentação oficial |
|---|---|---|---|
| Java | 25 (LTS) | Toolchain do Gradle; o host pode rodar outro JDK, o Foojay resolver baixa o 25 | https://docs.oracle.com/en/java/javase/25/ |
| Spring Boot | 4.1.1 | Versão padrão do start.spring.io | https://docs.spring.io/spring-boot/ e https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide |
| Spring Framework | 7.x (gerenciado pelo Boot) | | https://docs.spring.io/spring-framework/reference/ |
| Spring Security | 7.1.x (gerenciado pelo Boot) | | https://docs.spring.io/spring-security/reference/ |
| Spring Session JDBC | 4.1.1 | Sessão no Postgres | https://docs.spring.io/spring-session/reference/ e https://docs.spring.io/spring-session/reference/configuration/jdbc.html |
| Spring Boot Mail (`spring-boot-starter-mail`) | 4.1.1 | E-mail de convite e reset por SMTP | https://docs.spring.io/spring-boot/reference/io/email.html |
| Spring Security Crypto (`AesBytesEncryptor`) | 7.1 | Cifra dos segredos TOTP em repouso | https://docs.spring.io/spring-security/reference/features/integrations/cryptography.html |
| Spring Data JPA + Hibernate ORM | Boot-managed, Hibernate 7.4.x | | https://docs.spring.io/spring-data/jpa/reference/ e https://hibernate.org/orm/documentation/ |
| Spring Modulith | 2.1.1 | Fronteiras de módulo verificadas em teste, eventos com registry JDBC | https://docs.spring.io/spring-modulith/reference/ |
| Spring AI | 2.0.1 | Starter Anthropic, tool calling, chat memory | https://docs.spring.io/spring-ai/reference/ |
| Spring AI Anthropic | idem | Modelo padrão do projeto: `claude-opus-5` | https://docs.spring.io/spring-ai/reference/api/chat/anthropic-chat.html |
| Spring AI Tools | idem | `@Tool`, `ToolCallback`, `ToolCallingManager`, `ToolContext` | https://docs.spring.io/spring-ai/reference/api/tools.html |
| Spring AI Chat Memory | idem | `spring-ai-starter-model-chat-memory-repository-jdbc` | https://docs.spring.io/spring-ai/reference/api/chat-memory.html |
| Flyway | 12.4.x (gerenciado pelo Boot) | `spring-boot-starter-flyway` + `flyway-database-postgresql` | https://documentation.red-gate.com/fd |
| PostgreSQL | 18 | | https://www.postgresql.org/docs/18/ |
| springdoc-openapi | 3.1.1 | `springdoc-openapi-starter-webmvc-ui`, compatível com Boot 4 | https://springdoc.org/ |
| Bouncy Castle | 1.80 (`bcprov-jdk18on`) | Implementação do Argon2 usada pelo `Argon2PasswordEncoder` | https://www.bouncycastle.org/documentation/ |
| Testcontainers | Boot-managed | `spring-boot-testcontainers`, `@ServiceConnection` | https://docs.spring.io/spring-boot/reference/testing/testcontainers.html |
| Docker Compose support | Boot-managed | `spring-boot-docker-compose`, lê `compose.yaml` | https://docs.spring.io/spring-boot/reference/features/docker-compose.html |
| Gradle | 9.8.0 | Requisito para rodar o Gradle em JDK 27 no host; Boot 4.1 exige 8.14+ ou 9.x | https://docs.gradle.org/current/userguide/ e https://docs.spring.io/spring-boot/gradle-plugin/ |
| Foojay toolchain resolver | 1.0.0 | Download automático do JDK do toolchain | https://plugins.gradle.org/plugin/org.gradle.toolchains.foojay-resolver-convention |

Notas do Spring Boot 4 que afetam o código:

- Starter web chama-se `spring-boot-starter-webmvc`. Flyway exige `spring-boot-starter-flyway`.
- Jackson 3: pacote `tools.jackson`, `@JacksonComponent`, bean `JsonMapper` no lugar de `ObjectMapper`.
- Testes: `@SpringBootTest` não traz MockMvc sozinho, use `@AutoConfigureMockMvc`. `@MockBean` virou `@MockitoBean`.
- Anotações de nulidade JSpecify no framework.

## Frontend

| Componente | Versão | Documentação oficial |
|---|---|---|
| Node.js | 24 LTS (`.node-version`) | https://nodejs.org/en/about/previous-releases |
| pnpm | 11.5 (campo `packageManager`) | https://pnpm.io/ |
| Next.js | 16.3.x, App Router, Turbopack | https://nextjs.org/docs e https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites |
| qrcode | 1.5.x | QR do otpauth:// na ativação do segundo fator (gerado no browser, data URL) | https://github.com/soldair/node-qrcode |
| React | 19.2.x | https://react.dev/ |
| TypeScript | 5.x | https://www.typescriptlang.org/docs/ |
| Tailwind CSS | 4.x | https://tailwindcss.com/docs |
| shadcn/ui (CLI v4, presets) | `shadcn@latest`, style `radix-nova`, base Radix, ícones Lucide | https://ui.shadcn.com/docs/cli, https://ui.shadcn.com/docs/theming, https://ui.shadcn.com/create |
| openapi-typescript | 7.x | https://openapi-ts.dev/ (tipos gerados em `packages/contracts` a partir do `openapi.json` que o teste `OpenApiContractTests` escreve) |

### shadcn/ui e presets

Toda a interface é construída sobre componentes do shadcn/ui, e a identidade visual inteira vem de um **preset** (estilo, cor base, tema, fonte, ícones, raio). Trocar a cara de um OS de cliente é um comando, sem tocar em componente.

Preset atual do `os-core`: `b2fA` (`https://ui.shadcn.com/create?preset=b2fA`). Foi gerado com `pnpm dlx shadcn@latest init -y -d --base radix --css-variables` e confirmado com `pnpm dlx shadcn@latest preset resolve`.

Comandos (sempre em `apps/web`):

```bash
# ver o que um preset contém
pnpm dlx shadcn@latest preset decode <codigo>

# trocar a identidade visual inteira (tema, fontes, ícones, componentes reinstalados)
pnpm dlx shadcn@latest apply --preset <codigo>

# aplicar só parte do preset
pnpm dlx shadcn@latest apply --preset <codigo> --only theme
pnpm dlx shadcn@latest apply --preset <codigo> --only font

# adicionar componentes
pnpm dlx shadcn@latest add <componente>
```

Regras que mantêm a troca de preset segura:

1. `src/components/ui/**` e `src/hooks/**` são gerados pelo CLI. Nunca editar à mão: `apply` sobrescreve. Componentes próprios ficam em `src/core/**` e `src/modules/**` e compõem os do shadcn.
2. Só tokens semânticos nas classes (`bg-background`, `text-muted-foreground`, `bg-primary`, `border-border`, `bg-sidebar`, `rounded-lg` etc). Nunca cor crua (`bg-blue-600`), nunca `oklch(...)` fora do `globals.css`.
3. Fontes entram por `--font-sans`, `--font-heading` e `--font-geist-mono` em `src/app/layout.tsx` + `globals.css`; o `apply` reescreve os dois.
4. Depois de um `apply`, rodar `pnpm lint && pnpm check-types && pnpm build` e conferir as telas.

## JDK: uma única fonte de verdade

`apps/api/gradle/gradle-daemon-jvm.properties` (gerado por `./gradlew updateDaemonJvm --jvm-version=25 --jvm-vendor=adoptium`) diz ao Gradle qual JDK roda o daemon e de onde baixá-lo; o toolchain do `build.gradle.kts` diz qual compila. Ambos 25, Temurin. Consequência: o JDK do `PATH` ou do `JAVA_HOME` só inicia o wrapper e pode ser qualquer versão recente; IntelliJ 2025.1+ lê o mesmo arquivo. Referências: https://docs.gradle.org/current/userguide/gradle_daemon.html#sec:daemon_jvm_criteria e https://www.jetbrains.com/help/idea/gradle-jvm-selection.html

## Comandos oficiais de criação usados

API, gerada pelo Spring Initializr:

```bash
curl -sSf https://start.spring.io/starter.tgz \
  -d type=gradle-project-kotlin -d language=java -d bootVersion=4.1.1 -d javaVersion=25 \
  -d baseDir=api -d groupId=com.maximusflow -d artifactId=os-api -d name=os-api \
  -d packageName=com.maximusflow.os \
  -d dependencies=web,security,data-jpa,postgresql,flyway,session-jdbc,modulith,spring-ai-anthropic,validation,actuator,testcontainers,docker-compose,configuration-processor \
  | tar -xzf -
```

Web, gerada pelo `create-next-app`:

```bash
pnpm create next-app@latest web --yes --src-dir
```

Ajustes feitos depois da geração: wrapper do Gradle para 9.8.0, Foojay resolver no `settings.gradle.kts`, `spring-modulith-starter-jdbc` no lugar do `-jpa` (o JDBC traz o `schema-postgresql.sql` que copiamos para o Flyway), springdoc, `compose.yaml` com Postgres 18 e volume, `application.yml` no lugar do `.properties`.

## Segurança e conformidade (referências)

| Referência | Uso no projeto | Link |
|---|---|---|
| OWASP ASVS 5.0, capítulos V7 (sessão), V8 (autorização), V16 (logging) | Checklist em `security-baseline.md` | https://github.com/OWASP/ASVS/tree/master/5.0/en |
| OWASP Cheat Sheets: Session Management, Password Storage, CSRF, Logging | Parâmetros concretos (cookie, Argon2id, timeouts) | https://cheatsheetseries.owasp.org/ |
| OWASP Top 10 for LLM Applications 2025 | Desenho do agente de IA | https://genai.owasp.org/llm-top-10/ |
| LGPD, Lei 13.709/2018 | Base legal, direitos do titular, registro de operações, incidentes | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm |
| ANPD, Guia de Segurança da Informação para Agentes de Tratamento de Pequeno Porte e modelo de Registro das Operações | Checklist mínimo para o ICP | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte |
| Anthropic Claude API | Modelos, limites, boas práticas de tools | https://docs.anthropic.com/ |
