# Deploy de referência

Um OS por cliente, em um único servidor, com Docker Compose. Tudo que a instalação precisa está em `deploy/`: `compose.yaml` (Postgres, API, web, Caddy), `Caddyfile` (TLS automático), `.env.example` (variáveis), `update.sh` e `backup.sh`.

As imagens da API e do web são construídas no GitHub Actions do fork (`cd.yml`) e publicadas no GitHub Container Registry do fork com a tag do commit. O servidor nunca compila: ele só faz `pull` e reinicia. Isso mantém o servidor pequeno, torna cada deploy reproduzível e faz do rollback um comando.

## Requisitos do servidor

- Linux com Docker Engine 27+ e Compose v2. 2 vCPU e 4 GB de RAM atendem o ICP (10 a 50 pessoas).
- Portas 80 e 443 abertas para a internet (Let's Encrypt valida por HTTP e o portal responde por HTTPS). Nenhuma outra porta é publicada: Postgres, API e web só existem na rede interna do Compose.
- Um registro DNS (A/AAAA) do domínio do portal apontando para o servidor antes do primeiro `up`.
- Disco criptografado (LUKS ou equivalente da nuvem): o banco guarda dados confidenciais em repouso.
- `age` instalado (`apt install age`) para o backup criptografado.

## Primeira instalação

```bash
git clone <fork-do-cliente> /opt/os && cd /opt/os/deploy
cp .env.example .env && chmod 600 .env
# edite .env: OS_DOMAIN, OS_BOOTSTRAP_*, OS_IMAGE_REPOSITORY (ghcr.io/<owner-do-fork>), BACKUP_* e, se houver, SMTP
./init-secrets.sh             # cria secrets/ com senha do banco e chave de MFA geradas; nunca sobrescreve
printf '%s' 'sk-ant-...' > secrets/anthropic_api_key
docker login ghcr.io          # token com escopo read:packages, só nesta primeira vez
./update.sh <sha-do-commit>   # imagens publicadas pelo cd.yml; ou ./update.sh para compilar no servidor
docker compose logs -f api    # aguarde "Started OsApiApplication"
```

Entre em `https://<OS_DOMAIN>` com o e-mail e a senha de `OS_BOOTSTRAP_*`. O portal exige uma nova senha antes de liberar qualquer outra tela. Depois disso, remova as três variáveis `OS_BOOTSTRAP_*` do `.env` (só valem com a tabela de usuários vazia) e convide as demais pessoas em Administração > Usuários.

## Atualização (manutenção mensal)

Com o workflow `cd.yml` configurado no fork, cada push na `main` constrói as imagens, publica no registry e, por SSH, roda `deploy/update.sh <sha>` no servidor (backup, pull, restart; Flyway aplica as migrações no boot da API). Configure no repositório do fork:

- variáveis: `DEPLOY_HOST`, `DEPLOY_HOST_KEY` (saída de `ssh-keyscan -t ed25519 <host>`, uma linha: fixa a chave do servidor e impede um intermediário de receber a sessão SSH), `DEPLOY_USER` (padrão `deploy`), `DEPLOY_PATH` (padrão `/opt/os`);
- secret: `DEPLOY_SSH_KEY` (chave privada de `DEPLOY_USER`, que precisa pertencer ao grupo `docker` e ter o fork clonado em `DEPLOY_PATH`).

O login no registry durante o deploy usa o `GITHUB_TOKEN` do próprio workflow, passado pelo stdin da sessão SSH e descartado no fim (`docker logout`): nenhuma credencial de registry fica no servidor.

À mão, o mesmo:

```bash
cd /opt/os && git fetch && git checkout <sha>
deploy/update.sh <sha>
docker compose -f deploy/compose.yaml logs --tail 100 api
```

A API reinicia em alguns segundos e o web espera o health check dela; a janela de indisponibilidade é essa. Não há compilação no servidor.

Reverter: `deploy/update.sh $(cat deploy/.previous-tag)` (o script guarda a tag anterior) e `git checkout` do mesmo commit para manter `deploy/` coerente. Migrações do Flyway não desfazem sozinhas; se a versão anterior não conhece o schema novo, restaure o backup feito antes da atualização.

## Backup e restauração

- Gere um par de chaves `age` fora do servidor (`age-keygen -o os-backup.key`), coloque a chave pública em `BACKUP_AGE_RECIPIENT` no `.env` e guarde a privada com quem pode restaurar (cofre de senhas da empresa). O servidor nunca tem a chave privada.
- `deploy/backup.sh` gera `backups/os-<data>.sql.gz.age`, com permissão só do dono, e apaga dumps com mais de 14 dias (`BACKUP_KEEP_DAYS`). Sem chave configurada ele se recusa a rodar (`BACKUP_PLAINTEXT=yes` só em volume já criptografado). Agende no cron e defina `BACKUP_UPLOAD_CMD` para copiar cada arquivo para fora do host (object storage, outro servidor).
- Restaurar em um banco vazio: `BACKUP_AGE_IDENTITY=os-backup.key deploy/restore.sh backups/os-<data>.sql.gz.age` com o Postgres no ar (`docker compose up -d postgres`) e depois `docker compose up -d`.
- Teste a restauração pelo menos uma vez por trimestre. Backup não testado não é backup.

## Como o tráfego flui

```
browser --HTTPS--> caddy --HTTP--> web (Next, porta 3000) --/api/*--> api (Spring, porta 8080) --> postgres
```

- Caddy termina TLS, adiciona `X-Forwarded-For` e `X-Forwarded-Proto`, envia HSTS, limita o corpo das requisições a 2 MB e não anuncia a própria versão.
- Cada container roda sem capabilities, sem ganho de privilégio, com limite de memória e de processos; API e web rodam como usuário sem privilégio em sistema de arquivos somente leitura. Só o Caddy publica portas.
- Se um balanceador de carga da nuvem ficar na frente (endereço público), defina `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` com o endereço dele: sem isso o Tomcat ignora `X-Forwarded-*` de fora da rede interna, e todos os visitantes compartilham o endereço do proxy no limite de taxa e na auditoria.
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
| `OS_IMAGE_REPOSITORY`, `OS_IMAGE_TAG` | com `update.sh <tag>` | De onde vêm as imagens `os-api` e `os-web`; o `update.sh` grava a tag implantada |
| `OS_BOOTSTRAP_ADMIN_EMAIL`, `OS_BOOTSTRAP_ADMIN_PASSWORD`, `OS_BOOTSTRAP_ADMIN_NAME` | só na primeira subida | Primeiro administrador; a senha precisa ser trocada no primeiro login. Remova as três depois |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `OS_MAIL_FROM`, `OS_MAIL_PORTAL_NAME` | não | E-mail de convite e reset; sem host (ou host vazio), o link aparece para o administrador no portal. Com host, `OS_MAIL_FROM` é obrigatório |
| `BACKUP_AGE_RECIPIENT`, `BACKUP_KEEP_DAYS`, `BACKUP_UPLOAD_CMD` | recipient sim | Backup criptografado (seção acima) |

### Segredos

Segredos não ficam no `.env` nem em variáveis de ambiente: ficam em `deploy/secrets/` (fora do git e do contexto de build das imagens), são montados pelo Compose em `/run/secrets` e a API os lê como propriedades do Spring (config tree, `application-prod.yml`). Assim não aparecem em `docker inspect`, no ambiente do processo nem em relatórios de erro.

| Arquivo em `deploy/secrets/` | Criado por `init-secrets.sh` | Uso |
|---|---|---|
| `db_password` | gerado | Senha do usuário `os` no Postgres; lida pelo Postgres na criação do banco e pela API |
| `mfa_encryption_key` | gerado | Cifra os segredos TOTP. Nunca troque: todos precisariam reconfigurar o segundo fator. Guarde uma cópia com a chave privada do backup, pois o backup sem ela não restaura o MFA |
| `anthropic_api_key` | vazio | Chave da Anthropic; preencha antes de subir |
| `mail_password` | vazio | Senha do SMTP, se houver |

O diretório fica com permissão `700` (só o dono lê no host); os arquivos com `644`, porque os containers rodam com usuários sem privilégio que não são donos deles. Trocar a senha do banco depois da criação exige `ALTER USER os PASSWORD` no Postgres e o mesmo valor em `db_password`.

Qualquer propriedade do Spring pode ser sobrescrita por variável de ambiente (`spring.ai.anthropic.chat.model` vira `SPRING_AI_ANTHROPIC_CHAT_MODEL`), sem editar arquivos da imagem.
