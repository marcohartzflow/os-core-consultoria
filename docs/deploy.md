# Deploy de referência

Um OS por cliente, em um único servidor, com Docker Compose. Tudo que a instalação precisa está em `deploy/`: `compose.yaml` (Postgres, API, web, Caddy), `Caddyfile` (TLS automático), `.env.example` (variáveis) e `backup.sh`.

## Requisitos do servidor

- Linux com Docker Engine 27+ e Compose v2. 2 vCPU e 4 GB de RAM atendem o ICP (10 a 50 pessoas).
- Portas 80 e 443 abertas para a internet (Let's Encrypt valida por HTTP e o portal responde por HTTPS). Nenhuma outra porta é publicada: Postgres, API e web só existem na rede interna do Compose.
- Um registro DNS (A/AAAA) do domínio do portal apontando para o servidor antes do primeiro `up`.
- Disco criptografado (LUKS ou equivalente da nuvem): o banco guarda dados confidenciais em repouso.

## Primeira instalação

```bash
git clone <fork-do-cliente> /opt/os && cd /opt/os/deploy
cp .env.example .env && chmod 600 .env
# edite .env: OS_DOMAIN, POSTGRES_PASSWORD, ANTHROPIC_API_KEY, OS_BOOTSTRAP_* e, se houver, SMTP
docker compose up -d --build
docker compose logs -f api   # aguarde "Started OsApiApplication"
```

Entre em `https://<OS_DOMAIN>` com o e-mail e a senha de `OS_BOOTSTRAP_*`. O portal exige uma nova senha antes de liberar qualquer outra tela. Depois disso, remova as três variáveis `OS_BOOTSTRAP_*` do `.env` (só valem com a tabela de usuários vazia) e convide as demais pessoas em Administração > Usuários.

## Atualização (manutenção mensal)

```bash
cd /opt/os && git pull            # ou git merge upstream/main no fork
deploy/update.sh                  # backup, rebuild, restart; Flyway aplica as migrações no boot da API
docker compose -f deploy/compose.yaml logs --tail 100 api
```

Com o workflow `cd.yml` configurado no fork (variável `DEPLOY_HOST` e secret `DEPLOY_SSH_KEY`), o mesmo script roda sozinho a cada push na `main`. O usuário SSH precisa pertencer ao grupo `docker` e ter o repositório clonado em `DEPLOY_PATH`.

Reverter: `git checkout <tag-anterior>` e `docker compose up -d --build`. Migrações do Flyway não desfazem sozinhas; se a versão anterior não conhece o schema novo, restaure o backup feito antes da atualização.

## Backup e restauração

- `deploy/backup.sh` gera `backups/os-<data>.sql.gz` e apaga dumps com mais de 14 dias (`BACKUP_KEEP_DAYS`). Agende no cron do servidor e copie o diretório para fora do host todo dia.
- Restaurar em um banco vazio:

```bash
docker compose up -d postgres
gunzip -c backups/os-<data>.sql.gz | docker compose exec -T postgres psql -U os -d os
docker compose up -d
```

- Teste a restauração pelo menos uma vez por trimestre. Backup não testado não é backup.

## Como o tráfego flui

```
browser --HTTPS--> caddy --HTTP--> web (Next, porta 3000) --/api/*--> api (Spring, porta 8080) --> postgres
```

- Caddy termina TLS, adiciona `X-Forwarded-For` e `X-Forwarded-Proto` e envia HSTS.
- O Next reescreve `/api/*` para `http://api:8080` (endereço fixado na build da imagem, `ARG API_URL`).
- A API roda com o perfil `prod`: cookie `Secure`, OpenAPI desligado, `forward-headers-strategy: native` (só confia em proxies de rede interna, que é o caso da rede do Compose).
- O health check do container da API lê `/actuator/health`; ele não depende de SMTP.

## Logs e retenção

- `docker compose logs` usa o driver padrão do Docker. Limite o tamanho em `/etc/docker/daemon.json` (`"log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "5"}`) para o log não crescer sem fim.
- A trilha de auditoria de negócio fica no banco (`audit_event`), não no log, e entra no backup.
- Links de convite e reset nunca vão para o log em `prod`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `OS_DOMAIN` | sim | Domínio público; vira `OS_APP_BASE_URL=https://<domínio>` e o host do Caddy |
| `POSTGRES_PASSWORD` | sim | Senha do banco (gere com `openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | sim | Assistente |
| `OS_MFA_ENCRYPTION_KEY` | sim | Cifra os segredos TOTP; gere uma vez (`openssl rand -base64 32`) e nunca troque, ou todos precisam reconfigurar o segundo fator |
| `OS_BOOTSTRAP_ADMIN_EMAIL`, `OS_BOOTSTRAP_ADMIN_PASSWORD`, `OS_BOOTSTRAP_ADMIN_NAME` | só na primeira subida | Primeiro administrador |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, `OS_MAIL_FROM`, `OS_MAIL_PORTAL_NAME` | não | E-mail de convite e reset; sem host, o link aparece para o administrador no portal |

Qualquer propriedade do Spring pode ser sobrescrita por variável de ambiente (`spring.ai.anthropic.chat.model` vira `SPRING_AI_ANTHROPIC_CHAT_MODEL`), sem editar arquivos da imagem.
