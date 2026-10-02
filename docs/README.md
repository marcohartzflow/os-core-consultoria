# Documentação do OS Core

Leia na ordem do seu papel. Cada documento é fonte de verdade para o seu assunto; quando o código muda, o documento muda no mesmo PR.

## Para quem vai desenvolver

1. [`architecture.md`](architecture.md): modelo de negócio, monorepo, módulos, persistência, sessão, autorização, fases.
2. [`stack.md`](stack.md): versões, links da documentação oficial, comandos de criação, regras do shadcn/ui com presets.
3. [`new-module.md`](new-module.md): passo a passo para criar um módulo de negócio no fork.
4. [`ai-agent.md`](ai-agent.md): como um use case vira tool, filtro por permissão, confirmação humana, streaming.
5. [`performance.md`](performance.md): índices, paginação por posição, busca por texto, medição com carga (antes e depois).

## Para quem vai instalar e operar

1. [`deploy.md`](deploy.md): servidor, Compose, TLS, variáveis, atualização, backup e restauração.
2. [`fork.md`](fork.md): criar o fork do cliente, manutenção mensal, checklist de entrega.

## Para segurança e conformidade

1. [`security-baseline.md`](security-baseline.md): controles por área (ASVS, OWASP LLM, LGPD), checklist de revisão e histórico de revisões.
2. [`../SECURITY.md`](../SECURITY.md): como reportar vulnerabilidade.

## Andamento

- [`andamento/onde-paramos.md`](andamento/onde-paramos.md): estado atual, próximos passos e pendências conhecidas.
- [`andamento/feito.md`](andamento/feito.md): o que foi feito nas últimas frentes de trabalho.

## Processo

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): branches, commits, PR, revisão de segurança.
- [`../CHANGELOG.md`](../CHANGELOG.md): mudanças por versão, o que o fork precisa saber no merge mensal.

## Fluxo de CI e CD

- `ci.yml` roda em todo PR e em push na `develop`: build e testes da API (Testcontainers), lint, tipos e build do web, auditoria dos workflows (`zizmor`), build das duas imagens Docker e varredura delas (Grype: crítica com correção barra).
- `cd.yml` roda em push na `main`. Primeiro chama o `ci.yml` (`workflow_call`): um teste vermelho para tudo ali. Só num fork de cliente, onde existe a variável `DEPLOY_HOST`, ele depois constrói as imagens, publica no GitHub Container Registry do fork com a tag do commit e, por SSH com host key fixada, pede ao servidor o deploy daquele commit (`deploy/ci-deploy.sh`, o único comando que a chave do CI pode rodar: backup, pull, migrações, restart, espera os serviços saudáveis) e confere o portal de fora em `DEPLOY_URL/api/health`. No `os-core` ele roda só o CI: o core é a base, não um produto em produção.
- Rollback: Actions > CD > Run workflow com o SHA de um deploy anterior da `main`; reimplanta as imagens daquele commit sem testar nem construir de novo.
- Todas as actions são fixadas pelo SHA do commit da versão, com a tag em comentário; o Dependabot atualiza os dois.
