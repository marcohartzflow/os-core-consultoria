# Contribuindo com o OS Core

## Branches e versões

- `main`: o que os forks de cliente recebem no merge mensal. Só entra por PR com CI verde.
- `develop`: integração do que vai para a próxima versão.
- Versão é uma tag `vMAJOR.MINOR.PATCH` na `main` com a seção correspondente no `CHANGELOG.md`. `MAJOR` sobe quando um fork precisa de intervenção manual no merge (mudança de contrato de extension point, migração que exige passo manual).

## Commits e PRs

- Conventional Commits: `feat(iam): ...`, `fix(auth): ...`, `chore: ...`, `docs: ...`. Mudança que exige ação no fork leva `!` (`feat(iam)!: ...`) e uma nota em `CHANGELOG.md` sob "Ação necessária no fork".
- Um PR, um assunto. Descrição diz o que muda, por que, e como foi provado (testes, smoke).
- Documentação muda no mesmo PR que o código. `docs/README.md` diz qual documento cobre cada assunto.

## Antes de abrir o PR

```bash
cd apps/api && ./gradlew test        # inclui ModularityTests
cd ../.. && pnpm lint && pnpm check-types && pnpm build
```

Mudou controller ou record da API? Rode os testes da API (eles regravam `packages/contracts/openapi.json`) e depois `pnpm contracts` para regerar os tipos. O CI falha se um dos dois arquivos estiver desatualizado.

## Regras que o CI e a revisão cobram

1. Todo use case tem `@RequiresPermission`; controller não tem regra de negócio.
2. Módulo core não importa módulo de cliente nem pacote `internal` de outro módulo.
3. Migração só via Flyway, numerada em sequência; nunca editar migração já aplicada.
4. Interface só com componentes de `src/components/ui` (shadcn) e tokens semânticos.
5. Dado pessoal novo: o módulo implementa `PersonalDataContributor` e a ação relevante gera `audit_event`.
6. Checklist de revisão de segurança em `docs/security-baseline.md`, seção 8, aplicado a todo PR que toque autenticação, autorização, dados pessoais ou o agente.
