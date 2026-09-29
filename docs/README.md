# Documentação do OS Core

Leia na ordem do seu papel. Cada documento é fonte de verdade para o seu assunto; quando o código muda, o documento muda no mesmo PR.

## Para quem vai desenvolver

1. [`architecture.md`](architecture.md): modelo de negócio, monorepo, módulos, persistência, sessão, autorização, fases.
2. [`stack.md`](stack.md): versões, links da documentação oficial, comandos de criação, regras do shadcn/ui com presets.
3. [`new-module.md`](new-module.md): passo a passo para criar um módulo de negócio no fork.
4. [`ai-agent.md`](ai-agent.md): como um use case vira tool, filtro por permissão, confirmação humana, streaming.

## Para quem vai instalar e operar

1. [`deploy.md`](deploy.md): servidor, Compose, TLS, variáveis, atualização, backup e restauração.
2. [`fork.md`](fork.md): criar o fork do cliente, manutenção mensal, checklist de entrega.

## Para segurança e conformidade

1. [`security-baseline.md`](security-baseline.md): controles por área (ASVS, OWASP LLM, LGPD), checklist de revisão e histórico de revisões.
2. [`../SECURITY.md`](../SECURITY.md): como reportar vulnerabilidade.

## Processo

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): branches, commits, PR, revisão de segurança.
- [`../CHANGELOG.md`](../CHANGELOG.md): mudanças por versão, o que o fork precisa saber no merge mensal.

## Fluxo de CI e CD

- `ci.yml` roda em todo PR e push em `main` e `develop`: build e testes da API (Testcontainers), lint, tipos e build do web, build das duas imagens Docker.
- `cd.yml` roda em push na `main` só quando a variável `DEPLOY_HOST` existe no repositório, ou seja, só em forks de cliente. Ele constrói as imagens, publica no GitHub Container Registry do fork com a tag do commit e, por SSH com host key fixada, executa `deploy/update.sh <sha>` no servidor (backup, pull, restart). O `os-core` não tem ambiente próprio: ele é a base, não um produto em produção.
