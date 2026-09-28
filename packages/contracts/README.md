# @maximusflow/contracts

Types of the API, generated. `openapi.json` is written by `OpenApiContractTests` when the API test
suite runs; `src/schema.d.ts` is produced from it by `pnpm contracts` (openapi-typescript). Both
files are committed and CI fails when either is stale, so after changing a controller or a record:

```bash
cd apps/api && ./gradlew test
cd ../.. && pnpm contracts
```

The web app imports only types (`import type { UserSummary } from "@maximusflow/contracts"`); the
runtime client stays in `apps/web/src/core/api/client.ts`.
