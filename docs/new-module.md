# Como criar um módulo de negócio

Guia para o fork de cliente (`<cliente>-os`). O módulo `tasks` do `os-core` é a referência: copie a estrutura dele e troque o domínio. Nada no módulo `ai`, `auth` ou `iam` precisa mudar para o novo módulo aparecer no portal e no agente.

## 1. Backend (`apps/api`)

Crie o pacote `com.maximusflow.os.<modulo>` com esta estrutura:

```
<modulo>/
  package-info.java                      @ApplicationModule(allowedDependencies = { "common", ... })
  internal/
    domain/       entidades JPA (estendem AuditableEntity), enums
    persistence/  repositórios Spring Data
    application/  use cases (@Service) e records de saída (DTOs)
    web/          controller fino (@RestController)
```

1. **Migração Flyway** em `src/main/resources/db/migration/V<n>__<modulo>.sql`. Inclua as colunas de auditoria de linha (`created_at`, `created_by`, `updated_at`, `updated_by`). Não crie FK para tabelas de outros módulos; valide o vínculo pela API pública do módulo dono (ex.: `UserDirectory` do `iam`).
2. **`package-info.java`** com `@ApplicationModule(allowedDependencies = { "common", "iam" })`. Liste só o que o módulo usa. O `ModularityTests` falha se o código importar algo fora da lista ou um pacote `internal` de outro módulo.
3. **Use cases** em uma classe `@Service @Transactional`. Cada método público é um caso de uso e recebe:
   - `@RequiresPermission(value = "<modulo>.<recurso>.<acao>", description = "...")`. A permissão passa a existir no catálogo por causa dessa anotação, e a role de sistema a recebe automaticamente. A descrição aparece na tela de roles.
   - `@Tool(name = "<modulo>_<acao>", description = "...")` se o agente deve poder executar. Escreva a descrição para o modelo: quando usar, o que devolve, como obter os ids que ele precisa. Parâmetros com `@ToolParam(description = ...)`; opcionais com `required = false` e `@Nullable`.
   - `@Destructive("frase mostrada na confirmação")` em tudo que apaga, desativa, envia, paga ou altera em massa. Na dúvida, marque.
   - Validação de tamanho e regra de negócio dentro do método (o JSON do modelo não passa por Bean Validation). Erros de regra lançam `DomainRuleException` (422), ausência lança `NotFoundException` (404), duplicidade lança `ConflictException` (409).
   - `AuditRecorder.record("<modulo>.<recurso>.<evento>", "<entidade>", id, detalhes)` em toda ação que altera dado.
   - Retorno sempre por record de saída, nunca a entidade.
4. **Controller** só mapeia HTTP para o use case: `@Valid` no request, `@ResponseStatus` adequado, nenhuma regra. O prefixo é `/api/<modulo>`; tudo sob `/api/**` já exige sessão.
5. **Teste** em `src/test/java/...`: siga `TasksModuleTests`. O mínimo é provar que as tools aparecem no `ToolRegistry` com a permissão certa, que REST e tool executam o mesmo use case e que sem permissão a tool é negada.

## 2. Frontend (`apps/web`)

1. **Tipos** em `src/modules/<modulo>/types.ts`, reexportados de `@maximusflow/contracts` (gerados: `pnpm api:test` escreve `packages/contracts/openapi.json`, `pnpm contracts` gera os tipos; o CI falha se estiverem desatualizados). Nada é escrito à mão, como em `src/modules/tasks/types.ts`.
2. **Tela** em `src/modules/<modulo>/<Modulo>Page.tsx`, usando só componentes de `src/components/ui` (shadcn) e tokens semânticos, como `src/modules/tasks/TasksPage.tsx`. Componente que falte, adicione com `pnpm dlx shadcn@latest add <componente>`. Botões de ação ficam dentro de `<RequirePermission permission="...">`; a API valida de qualquer forma.
3. **Rota** em `src/app/(os)/<modulo>/page.tsx` que só renderiza a tela do módulo. O layout `(os)` já cuida de sessão e shell.
4. **Menu** em `src/modules/navigation.ts`: adicione uma seção ou item com `permission` igual à permissão de leitura do módulo.

## 3. O que acontece sozinho

- A permissão nova entra no catálogo (`GET /api/iam/permissions`) e na role de sistema no próximo boot.
- O agente descobre as tools no boot e as oferece só a quem tem a permissão; tools destrutivas param para confirmação; toda chamada é auditada.
- A migração roda no boot; `ddl-auto=validate` confere o mapeamento.

## 4. O que nunca fazer

- Editar `common`, `auth`, `iam` ou `ai`. Se o core precisa mudar, a mudança nasce no `os-core` e desce por merge.
- Importar `internal` de outro módulo ou criar FK de banco entre módulos.
- Colocar regra de negócio ou checagem de permissão no controller ou no front.
- Criar tool sem `@RequiresPermission` (o boot recusa) ou tool "genérica" (SQL livre, HTTP livre).
- Devolver entidade JPA em resposta ou em tool.
