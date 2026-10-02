# Deploy de referência

Um OS por cliente, em um único servidor (uma VPS, por exemplo na Hostinger), com Docker Compose. O cliente é dono do repositório (`<cliente>-os`, ver `fork.md`), da VPS, do domínio e das contas de serviço; nós entramos como colaboradores. Tudo que a instalação precisa está em `deploy/`: `compose.yaml` (Postgres, migrações, API, web, Caddy), `postgres-roles.sh` (roles do banco), `Caddyfile` (TLS automático), `.env.example` (variáveis), `init-secrets.sh`, `update.sh`, `ci-deploy.sh`, `backup.sh`, `restore.sh`, `restore-check.sh` e `ansible/` (preparação do servidor).

As imagens da API e do web são construídas no GitHub Actions do fork (`cd.yml`) e publicadas no GitHub Container Registry do fork com a tag do commit. O servidor nunca compila: ele só faz `pull` e reinicia. Isso mantém o servidor pequeno, torna cada deploy reproduzível e faz do rollback um clique.

## Fluxo de branches

- `develop`: onde o trabalho é integrado e validado (CI em todo push e PR, testes locais).
- `main`: produção. Cada push na `main` passa pelo CI e, verde, vai para o servidor.
- Enquanto o projeto do cliente não está concluído, a própria instância é a homologação: o cliente valida nela. Antes de receber dados reais, ela passa pela "Entrada em produção" (abaixo).

O cliente usa o GitHub Free. Em repositório privado, esse plano não tem proteção de branch nem regras de proteção de deploy (revisor obrigatório, timer, secrets de environment) ([plano por recurso](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)). O que garante que só código testado chega ao servidor é o próprio `cd.yml`, que roda o CI antes, e o servidor, que só aceita commits da `main`. A regra de processo: a `main` só recebe merge de PR vindo da `develop` com CI verde. Quem tem escrita no repositório pode publicar em produção; dê escrita só a quem pode fazer deploy.

## Requisitos do servidor

- Ubuntu 24.04 LTS (ou 22.04, 26.04: as versões que o Docker Engine suporta) com acesso root por chave SSH. Na Hostinger, cadastre a sua chave pública no painel ao criar a VPS.
- 2 vCPU e 4 GB de RAM atendem o ICP (10 a 50 pessoas).
- Portas 80 e 443 abertas para a internet (Let's Encrypt valida por HTTP e o portal responde por HTTPS), além da 22 para SSH. Nenhuma outra porta é publicada: Postgres, API e web só existem nas redes internas do Compose. Se o provedor tem firewall próprio no painel, libere as mesmas três.
- Um registro DNS (A/AAAA) do domínio do portal apontando para o servidor antes do primeiro `up`.
- No domínio do remetente dos e-mails (`OS_MAIL_FROM`): SPF, DKIM e DMARC configurados conforme o provedor de SMTP. Sem autenticação do remetente, Gmail e Outlook recusam ou mandam para o spam ([diretrizes de remetente do Google](https://support.google.com/a/answer/81126)), e o convite por e-mail é a única forma de entrar no portal.

### Dados em repouso

Os dados confidenciais em repouso são protegidos pelo acesso ao servidor (só chaves SSH de quem administra, nenhum serviço além do Caddy exposto), pelos roles do banco, pela cifra na aplicação (segredo TOTP; campos de alta sensibilidade dos módulos do cliente, `security-baseline.md` seção 5) e pelo backup cifrado com `age` guardado fora do servidor. Disco criptografado pelo provedor é bem-vindo quando existe, mas não é exigido: ele protege um disco descartado ou levado do datacenter, não um servidor ligado nem o próprio provedor, que guarda as chaves. A Hostinger não documenta criptografia do disco da VPS; o cliente pergunta ao provedor por escrito e a resposta vai para o registro do projeto (risco aceito em `security-baseline.md`, seção 9).

Backup e snapshot automáticos do painel do provedor copiam o disco inteiro, inclusive o banco e `deploy/secrets/`, sem a nossa criptografia. Desligue-os, ou registre com o cliente que existem, onde ficam e quem acessa. O backup do OS é o do `backup.sh`.

## Preparar o servidor

O playbook `deploy/ansible/provision.yml` deixa toda VPS de cliente igual e pode rodar de novo a qualquer momento (cada tarefa declara o estado final e só muda o que difere). Ele roda da máquina de quem administra; no servidor basta SSH e o Python que já vem no Ubuntu.

- Administradores com chave SSH e `sudo`; o usuário `deploy`, que roda o Docker, aceita só a chave do CD e só para `deploy/ci-deploy.sh`.
- SSH sem senha e sem root; firewall (`ufw`) com 22, 80 e 443.
- Docker Engine e Compose pelo repositório apt oficial do Docker ([guia de instalação](https://docs.docker.com/engine/install/ubuntu/)), removendo os pacotes que conflitam.
- Atualizações automáticas de segurança (`unattended-upgrades`) e relógio sincronizado (o código TOTP só vale no próprio passo de 30 s).
- Clone do repositório do cliente com uma deploy key só de leitura, gerada no servidor; `deploy/.env` copiado do exemplo e `deploy/secrets/` gerado pelo `init-secrets.sh`. O playbook nunca carrega segredo.
- Backup diário no cron, com o resultado no journal (`journalctl -t os-backup`), e teste de restauração no dia 1 de cada mês (`deploy/restore-check.sh`, `journalctl -t os-restore-check`); os dois podem pingar um monitor (`os_backup_heartbeat_url`, `os_restore_check_heartbeat_url`).
- Reinício automático às 04:00 do horário do servidor (`os_reboot_time`; UTC na maioria das VPS, 01:00 em Brasília), só quando uma atualização pede (correção de kernel), pelo próprio `unattended-upgrades`.

```bash
pipx install --include-deps ansible            # na sua máquina (ou: pip install ansible)
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
cp inventory.example.yml inventory.yml         # endereço, repositório, administradores, chave do CD
ssh-keygen -t ed25519 -N '' -C cd -f cd-key    # par do CD: cd-key.pub no inventário, cd-key no secret DEPLOY_SSH_KEY
ansible-playbook -i inventory.yml provision.yml -u root      # primeira vez
ansible-playbook -i inventory.yml provision.yml -u <admin>   # depois (root não entra mais)
```

Na primeira vez o playbook mostra a chave pública de deploy do servidor e espera: adicione em Settings > Deploy keys do repositório do cliente, sem "Allow write access", e tecle Enter. Depois guarde `cd-key` como secret e apague o arquivo local. `inventory.yml` e `cd-key*` não vão para o git.

## Primeira instalação

Com o servidor preparado, como um administrador:

```bash
sudo -iu deploy
cd /opt/os/deploy
# edite .env: OS_DOMAIN, OS_BOOTSTRAP_*, OS_IMAGE_REPOSITORY (ghcr.io/<owner-do-fork>), BACKUP_* e o SMTP (obrigatório)
printf '%s' 'sk-ant-...' > secrets/anthropic_api_key
printf '%s' '<senha-do-smtp>' > secrets/mail_password   # se o servidor SMTP autentica
```

Depois configure o deploy contínuo (abaixo) e faça o primeiro deploy pelo GitHub: Actions > CD > Run workflow, sem SHA. Acompanhe no servidor:

```bash
docker compose logs migrate   # migrações aplicadas, o container termina com status 0
docker compose logs -f api    # aguarde "Started OsApiApplication"
```

Entre em `https://<OS_DOMAIN>` com o e-mail de `OS_BOOTSTRAP_ADMIN_EMAIL` e a senha de `secrets/bootstrap_admin_password` (`cat secrets/bootstrap_admin_password`). O portal exige uma nova senha e o cadastro do segundo fator antes de liberar qualquer outra tela. Depois disso, remova `OS_BOOTSTRAP_ADMIN_EMAIL` e `OS_BOOTSTRAP_ADMIN_NAME` do `.env` e esvazie o arquivo da senha (`: > secrets/bootstrap_admin_password`; só valem com a tabela de usuários vazia), e convide as demais pessoas em Administração > Usuários.

Sem GitHub Actions (servidor sem acesso ao registry), `deploy/update.sh` sem argumento compila as imagens no próprio servidor.

## Deploy contínuo

Cada push na `main` roda o CI e, verde, constrói as imagens, publica no registry e pede ao servidor o deploy daquele commit. No repositório do fork, Settings > Secrets and variables > Actions:

- variáveis: `DEPLOY_HOST`; `DEPLOY_URL` (endereço público do portal, `https://<OS_DOMAIN>`); `DEPLOY_HOST_KEY` (saída de `ssh-keyscan -t ed25519 <host>`, uma linha: fixa a chave do servidor e impede um intermediário de receber a sessão SSH; confira a impressão digital com `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` no próprio servidor); `DEPLOY_USER` (padrão `deploy`);
- secret: `DEPLOY_SSH_KEY` (a chave privada `cd-key` gerada na preparação).

Secrets e variáveis do repositório, não de environment: no GitHub Free, repositório privado não tem secrets de environment.

O que a chave do CD pode fazer no servidor: só `deploy <sha>`. O `authorized_keys` do usuário `deploy` amarra a chave a `deploy/ci-deploy.sh` com `restrict,command=...` (comando forçado do OpenSSH, [sshd(8)](https://man.openbsd.org/sshd#AUTHORIZED_KEYS_FILE_FORMAT)): sem shell, sem terminal, sem túnel. O script aceita só um SHA de 40 caracteres que já esteja na `origin/main`, faz `git checkout` dele (para `deploy/` acompanhar a versão) e roda `update.sh <sha>`: backup, pull das imagens, migrações no serviço `migrate`, restart. Como o usuário `deploy` roda o Docker, que equivale a root no host, uma chave vazada sem essa amarra daria o servidor inteiro; com ela, só reimplanta o que já está na `main`.

O login no registry usa o `GITHUB_TOKEN` do próprio job (só leitura de pacotes, válido até o job terminar), passado pelo stdin da sessão SSH para uma configuração do Docker temporária, apagada no fim mesmo se o deploy falhar: nenhuma credencial de registry fica no servidor. O `OS_IMAGE_REPOSITORY` vem do `.env` do servidor, não do workflow.

O `update.sh` faz, nesta ordem: backup; download das imagens novas; migrações, com a imagem nova, no serviço `migrate` (`docker compose run`), enquanto a API antiga continua atendendo; troca da API e, depois que ela está saudável, do web (`docker compose up --no-deps --wait`, um de cada vez, [referência](https://docs.docker.com/reference/cli/docker/compose/up/)); e por fim o resto da pilha (imagem nova do Postgres ou do Caddy, configuração alterada), sem mexer no que já está atualizado. Como toda migração aceita o código anterior (`CONTRIBUTING.md`), a API antiga funciona sobre o schema novo durante esse intervalo.

- Migração que falha: o Flyway desfaz a transação, o `update.sh` para ali e o portal segue no ar na versão anterior. O job fica vermelho; `docker compose logs migrate` mostra o erro.
- API que não fica saudável em 5 minutos: o `update.sh` falha, mostra `docker compose ps` e aponta para `docker compose logs migrate api`.
- O `.env` só registra a versão nova (`OS_IMAGE_TAG`) depois que ela está no ar: um deploy que falha deixa o arquivo apontando para a versão que roda.
- Cada deploy bem-sucedido entra em `deploy/.deployed-tags`; ficam no servidor as imagens das três últimas versões implantadas, e as demais são apagadas (sem isso, cada deploy deixa cerca de 1 GB em disco). Um rollback para uma versão mais antiga baixa as imagens do registry de novo.
- Indisponibilidade: de 7 a 13 segundos por deploy, o tempo de a API nova subir (medido num servidor de 2 vCPU e 4 GB). Os health checks testam a cada segundo enquanto o container sobe (`start_interval`, Docker Engine 25 ou mais novo), em vez de esperar o intervalo normal de 15 s. Aceita para o ICP; numa mudança com migração grande, faça o merge na `main` fora do horário comercial.

Depois, o job confere o portal de fora, em `DEPLOY_URL/api/health` (DNS, TLS, Caddy, Next, API e banco numa requisição), com até 10 novas tentativas. Qualquer falha deixa a execução vermelha, e o GitHub avisa por e-mail quem disparou o deploy.

Antes de publicar, o CD varre as duas imagens com o Grype: vulnerabilidade crítica que já tem correção barra o deploy. No CI, a mesma varredura roda em todo PR, e o `zizmor` audita os workflows.

### Reverter

Actions > CD > Run workflow com o SHA de um deploy anterior da `main`. As imagens daquele commit já estão no registry, então nada é testado nem construído de novo; o servidor confere que o commit está na `main`. O rollback é sempre decidido por uma pessoa, nunca automático: o Flyway não desfaz migração, e a imagem anterior rodaria sobre o schema novo. Por isso toda migração segue a regra de mudança em paralelo do `CONTRIBUTING.md` (o schema novo aceita o código anterior; o que sai, sai numa versão seguinte), e voltar uma versão é seguro. Se mesmo assim a versão anterior não funcionar com o schema, restaure o backup feito antes da atualização (o `update.sh` faz um a cada deploy); os dados gravados depois dele se perdem.

À mão, no servidor, o mesmo: `cd /opt/os && git fetch && git checkout <sha> && deploy/update.sh <sha>` (com `docker login ghcr.io` antes, se as imagens são privadas).

### Instalações antigas

Instalações criadas antes de o Caddy rodar sem root e de o `postgres-roles.sh` revogar os privilégios de `PUBLIC` precisam, uma vez, antes do `update.sh`:

```bash
cd /opt/os/deploy
# volumes do Caddy gravados como root passam ao usuário do container (10001)
docker run --rm -v os_caddy-data:/data -v os_caddy-config:/config "$(docker compose config --images | grep ^caddy)" chown -R 10001:10001 /data /config
# o postgres-roles.sh só roda com o volume vazio: aplique as revogações à mão
docker compose exec -T postgres psql -U postgres -d os -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON DATABASE os FROM PUBLIC;
GRANT CONNECT ON DATABASE os TO os_app;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL
```

## Entrada em produção

Enquanto o projeto do cliente está em construção, a instância acumula contas, senhas e dados de teste. Antes de receber dados reais:

1. Anote o que o cliente quer manter da fase de testes (roles, configurações): será refeito à mão, nada é copiado.
2. Apague o banco, os backups e os segredos e gere tudo de novo, em `/opt/os/deploy` como `deploy`: `docker compose down`, `docker volume rm os_postgres-data`, `rm -r secrets backups` e `./init-secrets.sh` (a chave de MFA e as senhas do banco mudam; nenhum segredo nem dado de teste segue para produção).
3. Preencha de novo a chave da Anthropic e a senha do SMTP, defina `OS_BOOTSTRAP_*` e faça o deploy (Actions > CD > Run workflow).
4. Siga "Primeira instalação" a partir do login do primeiro administrador.
5. Nunca rode `pnpm demo:data` contra o servidor (o script já recusa hosts que não sejam locais).

## Monitoramento

O deploy de referência não escolhe a ferramenta; o cliente escolhe e nós configuramos:

- Disponibilidade: um monitor externo consultando `https://<OS_DOMAIN>/api/health` a cada minuto (responde `{"status":"UP"}`, sem detalhes, passando por Caddy, Next, API e banco; com o banco fora, 503 em até 5 s), com alerta para quem responde pelo portal. A resposta fica em cache por 5 s, então chamadas repetidas não sobrecarregam o banco.
- Backup: `os_backup_heartbeat_url` no inventário do Ansible pinga uma URL a cada backup bem-sucedido; o serviço de monitoramento alerta quando o ping não chega (backup que falhou ou não rodou).
- Disco: alerta acima de 80% de uso (os backups locais e as imagens crescem com o tempo).
- Atualizações que pedem reinício (`/var/run/reboot-required`, em geral correção de kernel): o servidor reinicia sozinho às 04:00 (horário do servidor) e o Docker sobe a pilha de novo; o portal fica fora de 1 a 2 minutos nesse horário.
- Backup restaurável: o `restore-check.sh` roda todo dia 1 e falha se o dump não carregar ou se o banco restaurado tiver outras tabelas, outra migração ou outro número de usuários. Com `os_restore_check_heartbeat_url`, o monitor avisa quando ele falha ou não roda.

## Backup e restauração

- Gere um par de chaves `age` fora do servidor (`age-keygen -o os-backup.key`), coloque a chave pública em `BACKUP_AGE_RECIPIENT` no `.env` e guarde a privada com quem pode restaurar (cofre de senhas da empresa). O servidor nunca tem a chave privada.
- `deploy/backup.sh` gera `backups/os-<data>.sql.gz.age`, com permissão só do dono, e apaga dumps com mais de 14 dias (`BACKUP_KEEP_DAYS`). Sem chave configurada ele se recusa a rodar (`BACKUP_PLAINTEXT=yes` só em volume já criptografado). O playbook do Ansible agenda o backup diário no cron; defina `BACKUP_UPLOAD_CMD` para copiar cada arquivo para fora do host (object storage, outro servidor).
- O dump é feito como `os_owner`, sem dono e sem privilégios (`--no-owner --no-privileges`), e sem as linhas das tabelas de sessão (`spring_session*`): sessões são descartáveis e não devem voltar depois de uma restauração.
- Um backup que falha no meio não deixa arquivo: o dump é gravado com nome temporário (`.partial`) e só é renomeado quando o `pg_dump`, a compressão e a criptografia terminam sem erro.
- Restaurar em um banco vazio: `docker compose down`, `docker volume rm os_postgres-data`, `docker compose up -d postgres` (o volume novo recebe os roles de `postgres-roles.sh`, com as mesmas senhas de `secrets/`), `BACKUP_AGE_IDENTITY=os-backup.key deploy/restore.sh backups/os-<data>.sql.gz.age` e depois `docker compose up -d`. O `restore.sh` carrega o dump como `os_owner`, que volta a ser dono de tudo; o serviço `migrate` reaplica os privilégios do `os_app` (callback `afterMigrate.sql`) antes de a API subir. Todos entram de novo. O `restore.sh` primeiro descriptografa e descompacta o backup para um arquivo em um diretório temporário privado (`mktemp -d`, em `$TMPDIR`: precisa de espaço para o dump descompactado, que fica em texto claro até o fim do script e é apagado na saída) e só carrega se todo esse passo terminou sem erro e o arquivo termina com a linha final do `pg_dump`, `-- PostgreSQL database dump complete`. Um backup truncado ou corrompido é recusado antes de tocar no banco: `age` e `gunzip` entregam o que já decodificaram antes de perceber o erro, e o `psql`, lendo direto do pipe, tomaria o fim antecipado pelo fim do dump e confirmaria a carga parcial. Depois o `psql` carrega o arquivo em uma única transação e para no primeiro erro (`--single-transaction` com `ON_ERROR_STOP`, [psql](https://www.postgresql.org/docs/current/app-psql.html)): uma restauração que falha deixa o banco vazio, nunca carregado pela metade.
- **Eliminações (LGPD) feitas depois da data do backup precisam ser refeitas.** O backup guarda as pessoas como estavam quando foi feito: quem foi anonimizado depois volta com os dados pessoais. Antes de apagar o volume, exporte da trilha de auditoria as anonimizações posteriores ao backup (ação `iam.user.anonymized`; `entity_id` é o id do usuário) e guarde a lista fora do banco: `docker compose exec -T postgres psql -U os_owner -d os -c "SELECT occurred_at, entity_id FROM audit_event WHERE action = 'iam.user.anonymized' AND occurred_at > '<data-do-backup>' ORDER BY occurred_at" > anonimizacoes.txt`. Depois da restauração, antes de liberar o portal, anonimize de novo cada uma dessas pessoas (Administração > Usuários).
- O `restore-check.sh` prova todo mês que o dump do banco restaura, num Postgres temporário sem rede e com os dados em memória, sem tocar no banco real. Ele não decifra um backup de verdade, porque a chave privada do `age` não fica no servidor: uma vez por trimestre, quem guarda a chave restaura um backup cifrado (com o `restore.sh`, num servidor ou container à parte) e confere. Backup não testado não é backup.

## Como o tráfego flui

```
browser --HTTPS--> caddy --HTTP--> web (Next, porta 3000) --/api/*--> api (Spring, porta 8080) --> postgres
```

- Caddy termina TLS, define `X-Forwarded-For` e `X-Forwarded-Proto`, envia HSTS, limita o corpo das requisições a 2 MB, recusa `TRACE` e `TRACK` com 405 antes de repassar qualquer coisa (ASVS 13.4.4) e não anuncia a própria versão.
- Cada container remove todas as capabilities e devolve só as que precisa: o Postgres `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID` e `SETUID` (o entrypoint da imagem começa como root para acertar o dono do volume e depois troca para o usuário `postgres`); o Caddy `NET_BIND_SERVICE` (o binário da imagem oficial tem essa capability de arquivo, `setcap`, e o kernel recusa executá-lo sem ela); migrate, API e web nenhuma. Todos rodam sem ganho de privilégio, com limite de memória e de processos, com rotação de log e com sistema de arquivos raiz somente leitura (OWASP Docker Security Cheat Sheet, regra 8): o Postgres grava só no volume de dados e nos `tmpfs` `/tmp` e `/run/postgresql`, o Caddy só nos volumes `/data` e `/config`. Migrate, API, web e Caddy rodam como usuário sem privilégio. Só o Caddy publica portas.
- Redes separadas (OWASP Docker Security Cheat Sheet, regra 5): cada serviço só entra nas redes dos serviços com que conversa, e as redes `internal` não têm rota para fora do host.

  | Rede | Serviços | Saída para a internet |
  |---|---|---|
  | `edge` | caddy | sim (portas publicadas, Let's Encrypt) |
  | `frontend` | caddy, web | não |
  | `app` | web, api | não |
  | `database` | postgres, migrate, api | não |
  | `egress` | api | sim (Anthropic, Have I Been Pwned, SMTP) |

  O Postgres só é alcançável pelo `migrate` e pela API; o web e o Postgres não saem para a internet.
- IP do cliente (ASVS 15.3.4). Quem decide o IP do cliente é o Caddy, e ele repassa um único endereço no `X-Forwarded-For` (`header_up X-Forwarded-For {client_ip}` no `Caddyfile`). Por padrão o Caddy não confia em nenhum proxy e ignora `X-Forwarded-*` vindos de fora ([`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)): o IP do cliente é o endereço que conectou nele. O Next repassa o cabeçalho sem mudar, e o Tomcat (`forward-headers-strategy: native`, [RemoteIpValve](https://tomcat.apache.org/tomcat-11.0-doc/config/valve.html#Remote_IP_Valve)) aceita porque a conexão vem do container web, que está numa faixa privada (padrão de `server.tomcat.remoteip.internal-proxies` no Spring Boot). Não mude essa propriedade: o deploy de referência não precisa dela.
- Com um balanceador de carga ou CDN na frente do Caddy, defina `OS_TRUSTED_PROXIES` no `.env` com as faixas (CIDR, separadas por espaço) de onde ele conecta no Caddy. O Caddy passa a ler o `X-Forwarded-For` da direita para a esquerda e usa o primeiro endereço fora dessas faixas ([`trusted_proxies_strict`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies-strict): balanceadores acrescentam à direita, e o valor mais à esquerda é o que o navegador mandou). Sem isso, todos os visitantes compartilham o endereço do balanceador no limite de taxa e na auditoria. Liste só as faixas do balanceador: quem estiver nelas pode se passar por qualquer cliente. Vazia ou ausente, nenhum proxy é confiável.
- Um fork que troque o Caddy por outro proxy precisa entregar à API o mesmo: um `X-Forwarded-For` com o endereço do cliente, nunca o valor que veio do navegador acrescido (o `$proxy_add_x_forwarded_for` do nginx, por exemplo). O padrão do Tomcat confia em toda faixa privada, e quem está numa rede privada (escritório, VPN) poderia forjar o IP registrado na auditoria e fugir do limite por IP.
- O Next reescreve `/api/*` para `http://api:8080` (endereço fixado na build da imagem, `ARG API_URL`).
- A API roda com o perfil `prod`: cookie `Secure`, OpenAPI desligado, `forward-headers-strategy: native` (só confia em proxies de rede interna, que é o caso da rede do Compose).
- O health check do container da API lê `/actuator/health`; ele não depende de SMTP.

## Logs

- Onde ficam: cada container escreve no stdout, e o Docker guarda com o driver `json-file` em `/var/lib/docker/containers/<id>/<id>-json.log`. Leia com `docker compose logs <serviço>` (`api`, `migrate`, `web`, `caddy`, `postgres`). O `compose.yaml` configura rotação em todos os serviços (`max-size: 50m`, `max-file: 5`, [driver json-file](https://docs.docker.com/engine/logging/drivers/json-file/)): no máximo cerca de 250 MB por container, e o mais antigo é descartado.
- Eventos de segurança da API (falhas de login, bloqueio de conta, limite de taxa excedido, sessões encerradas, acesso negado) saem no logger `SECURITY`; filtre por ele (`docker compose logs api | grep SECURITY`) ou, no sistema de logs, pelo nome do logger.
- A trilha de auditoria de negócio fica no banco (`audit_event`), não no log, e entra no backup.
- Links de convite e reset nunca vão para o log em `prod`.
- **Logs em outro sistema (ASVS 16.4.3) é decisão da infraestrutura do cliente.** Com a rotação local, um invasor com root no host pode apagar o log, e o disco cheio ou a rotação descartam o histórico. Para cumprir o 16.4.3, envie os logs para um sistema separado, com retenção definida pelo cliente: troque o driver no `compose.yaml` (`logging.driver: syslog`, `fluentd` ou `gelf`, ver [drivers de log do Docker](https://docs.docker.com/engine/logging/configure/)) ou rode um agente de logs no host que leia os arquivos acima. O deploy de referência não escolhe o destino.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `OS_DOMAIN` | sim | Domínio público; vira `OS_APP_BASE_URL=https://<domínio>` e o host do Caddy |
| `OS_IMAGE_REPOSITORY`, `OS_IMAGE_TAG` | com `update.sh <tag>` | De onde vêm as imagens `os-api` e `os-web`; o `update.sh` grava a tag implantada |
| `OS_BOOTSTRAP_ADMIN_EMAIL`, `OS_BOOTSTRAP_ADMIN_NAME` | só na primeira subida | Primeiro administrador; a senha está em `secrets/bootstrap_admin_password` e precisa ser trocada no primeiro login. Remova as duas depois |
| `SPRING_MAIL_HOST`, `OS_MAIL_FROM` | sim | SMTP para convites e redefinição de senha. A API não sobe em produção sem os dois: o convite só chega por e-mail, e é recebê-lo que prova que o endereço é da pessoa |
| `SPRING_MAIL_PORT` | sim (padrão `587`) | Porta do SMTP |
| `SPRING_MAIL_USERNAME` | se o SMTP autentica | Usuário do SMTP; a senha fica em `secrets/mail_password` |
| `OS_MAIL_PORTAL_NAME` | não (padrão `OS`) | Nome do portal nos e-mails |
| `OS_TRUSTED_PROXIES` | não | Só com balanceador de carga ou CDN na frente do Caddy: faixas (CIDR) de onde ele conecta (seção "Como o tráfego flui"). Vazia, nenhum proxy é confiável |
| `BACKUP_AGE_RECIPIENT`, `BACKUP_KEEP_DAYS`, `BACKUP_UPLOAD_CMD` | recipient sim | Backup criptografado (seção acima) |

### Segredos

Segredos não ficam no `.env` nem em variáveis de ambiente: ficam em `deploy/secrets/` (fora do git e do contexto de build das imagens), são montados pelo Compose em `/run/secrets` e a API os lê como propriedades do Spring (config tree, `application-prod.yml`). Assim não aparecem em `docker inspect`, no ambiente do processo nem em relatórios de erro.

| Arquivo em `deploy/secrets/` | Criado por `init-secrets.sh` | Uso |
|---|---|---|
| `db_superuser_password` | gerado | Senha do superusuário `postgres`; só administração, nenhum serviço a usa |
| `db_owner_password` | gerado | Senha do `os_owner`, dono do schema; montada no `postgres` (criação do role) e no `migrate`, nunca na API |
| `db_app_password` | gerado | Senha do `os_app`, role da API |
| `bootstrap_admin_password` | gerado | Senha inicial do primeiro administrador (`os.iam.bootstrap.admin-password`); trocada no primeiro login. Esvazie o arquivo depois |
| `mfa_encryption_key` | gerado | Cifra os segredos TOTP. Nunca troque: todos precisariam reconfigurar o segundo fator. Guarde uma cópia com a chave privada do backup, pois o backup sem ela não restaura o MFA |
| `anthropic_api_key` | vazio | Chave da Anthropic; preencha antes de subir |
| `mail_password` | vazio | Senha do SMTP; preencha se o servidor autentica |

O diretório fica com permissão `700` (só o dono lê no host); os arquivos com `644`. Não dá para usar `600`: o Compose monta secrets de arquivo como bind mount, com o dono e a permissão do host (`uid`, `gid` e `mode` são ignorados nesse caso, [referência do Compose](https://docs.docker.com/reference/compose-file/services/#secrets)), e quem lê não é o dono dos arquivos: o usuário `postgres` (uid 999) roda o `postgres-roles.sh`, a API e o `migrate` rodam com uid 1001. Um grupo também não resolve: o usuário do deploy só pode atribuir grupos de que faz parte, e o entrypoint do Postgres (`gosu`) descarta grupos extras. Quem impede os outros usuários do host é o diretório `700`; dentro de cada container só roda o próprio usuário. As senhas do banco só são lidas na criação do volume (`postgres-roles.sh`). Para trocar uma depois, rode `docker compose exec postgres psql -U postgres -d os -c '\password os_app'` (ou `os_owner`, `postgres`), grave o mesmo valor no arquivo correspondente de `secrets/` e reinicie (`docker compose up -d --force-recreate migrate api`).

## Roles do banco

O banco tem três roles, criados por `deploy/postgres-roles.sh` quando o volume do Postgres está vazio (o entrypoint da imagem oficial só roda `/docker-entrypoint-initdb.d` nesse caso):

| Role | Atributos | Quem usa | O que pode |
|---|---|---|---|
| `postgres` | superusuário (padrão da imagem) | ninguém; só administração manual | tudo |
| `os_owner` | `LOGIN`, sem superusuário, sem `CREATEDB`/`CREATEROLE` | serviço `migrate` (Flyway) | dono do banco `os`, do schema `public` e de todos os objetos; cria a extensão `pg_trgm` (extensão *trusted*, basta ser dono do banco) |
| `os_app` | `LOGIN`, sem superusuário, sem `CREATEDB`/`CREATEROLE`, não é dono de nada | API | só privilégios de tabela, concedidos pelo callback do Flyway `afterMigrate.sql` a cada migração |

Nenhum role além do `os_owner` e do `os_app` conecta ao banco `os`, e só o superusuário conecta aos bancos `postgres` e `template1`: o `postgres-roles.sh` revoga o `CONNECT` e o `TEMPORARY` que o PostgreSQL concede a `PUBLIC` em todo banco ([Privileges](https://www.postgresql.org/docs/current/ddl-priv.html)) e concede `CONNECT` ao `os_app`. O `os_app` não cria nem tabelas temporárias. O teste `DatabaseRolesTests` (Testcontainers) roda o `postgres-roles.sh` e as migrações num PostgreSQL 18 e confere cada uma dessas restrições.

Privilégios do `os_app`: `SELECT` e `INSERT` em `audit_event`; `SELECT`, `INSERT` e `UPDATE` em `audit_activity_bucket`; `SELECT`, `INSERT` e `DELETE` em `spring_ai_chat_memory`; nada em `flyway_schema_history`; `SELECT`, `INSERT`, `UPDATE` e `DELETE` nas demais tabelas (sessões, registro de eventos do Spring Modulith, iam, ai, tasks e tabelas de módulos novos, via `ALTER DEFAULT PRIVILEGES`). Nunca `TRUNCATE`, nunca `CREATE` no schema.

Como a API não é dona das tabelas, quem obtiver as credenciais dela não consegue desligar os triggers que tornam `audit_event` append-only, alterar o schema, usar `session_replication_role` ou `COPY ... PROGRAM` (exigem dono ou superusuário). A senha do `os_owner` é montada só no container `postgres` (lida pelo `postgres-roles.sh` quando o volume é criado) e no `migrate`, que roda o Flyway e termina antes de a API subir; nunca no container da API.

Um módulo novo cuja tabela não pode receber `UPDATE` ou `DELETE` revoga esses privilégios em `afterMigrate.sql`.

Qualquer propriedade do Spring pode ser sobrescrita por variável de ambiente (`spring.ai.anthropic.chat.model` vira `SPRING_AI_ANTHROPIC_CHAT_MODEL`), sem editar arquivos da imagem.
