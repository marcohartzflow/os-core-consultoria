# Fork de cliente

Cada cliente recebe um repositório próprio (`<cliente>-os`), criado a partir do `os-core`. O cliente é dono desse repositório e pode sair com ele a qualquer momento. O contrato de manutenção mensal consiste em trazer o `os-core` atualizado para o fork e validar.

## Início do contrato: o que é do cliente

O cliente cria e é dono de tudo; nós entramos com o mínimo de acesso para trabalhar:

- Organização no GitHub (plano Free atende) com 2FA obrigatório para membros, e o repositório `<cliente>-os` privado e vazio. Nós entramos como colaboradores externos com papel `Maintain`, nunca `Owner`.
- A VPS (`deploy.md`, "Requisitos do servidor"), com a chave SSH de quem vai administrar cadastrada no painel.
- O domínio e o DNS (registro do portal; SPF, DKIM e DMARC do remetente).
- Conta da Anthropic (cobrança e contrato de tratamento de dados: a transferência internacional, LGPD art. 33, é decisão do cliente), provedor de SMTP e o destino do backup fora do servidor.
- O cofre do cliente guarda a chave privada do backup (`age`) e uma cópia de `deploy/secrets/mfa_encryption_key`. Nós não guardamos cópia.

## Criar o repositório

Com clone e push, nunca com o botão "Fork" do GitHub: o fork de um repositório privado fica preso a ele, e é apagado se o acesso ao original for retirado ([forks de repositório privado](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/what-happens-to-forks-when-a-repository-is-deleted-or-changes-visibility)). O repositório do cliente nunca recebe credencial do `os-core`; o merge mensal roda na nossa máquina, pelo remote `upstream`.

```bash
git clone git@github.com:MaximusFlow/os-core.git cliente-os && cd cliente-os
git remote rename origin upstream
git remote add origin git@github.com:<org-do-cliente>/cliente-os.git
git rm .github/dependabot.yml && git commit -m "chore: version updates come from os-core"
git push -u origin main
git push origin main:develop
```

O `dependabot.yml` sai do fork porque as versões das dependências chegam pelo merge mensal do `os-core`; PRs de versão no fork brigariam com esse merge. No fork, ative em Settings > Code security os alertas e as atualizações de segurança do Dependabot, que não precisam do arquivo. Se um merge mensal trouxer mudança no `dependabot.yml`, o conflito se resolve mantendo a remoção.

Depois, no fork:

1. Identidade visual: `cd apps/web && pnpm dlx shadcn@latest apply --preset <codigo>`. Nenhum componente é editado à mão.
2. Nome do portal: `OS_MAIL_PORTAL_NAME` (e-mails, aplicativo autenticador e prompt do agente) e `apps/web/src/core/brand.ts` (nome e marca do portal e do agente na tela). As frases que citam o agente ("o assistente quer…") ficam escritas onde aparecem, pela concordância; ao renomear o agente, revise-as buscando por "assistente".
3. Módulos de negócio: siga `new-module.md`. O módulo de exemplo `tasks` pode ficar ou ser removido (pacote `com.maximusflow.os.tasks`, migração `V6__tasks.sql` só se o banco ainda não existe, `src/modules/tasks`, entradas em `src/modules/navigation.ts` e `src/modules/dashboard.ts`, rota `src/app/(os)/tasks`).
4. Servidor e deploy: `deploy.md`, "Preparar o servidor" (Ansible) e "Deploy contínuo" (`cd.yml`, que fica inativo sem a variável `DEPLOY_HOST`).

## Branches no fork

- Trabalho em branches a partir da `develop`, com PR para a `develop` (CI em todo PR).
- `develop` para `main` por PR quando a entrega está validada; o merge na `main` publica em produção (`deploy.md`, "Fluxo de branches").
- O GitHub Free não protege branch em repositório privado: a regra acima é de processo, e o `cd.yml` roda o CI antes de qualquer deploy.

## Regras que mantêm o merge limpo

- O fork nunca edita `common`, `auth`, `iam`, `ai` nem `src/core` e `src/components/ui` do web. Personalização entra por `application.yml`, variáveis de ambiente, beans próprios, eventos e módulos do cliente.
- Migrações do cliente começam em `V100__` para nunca colidir com as do core.
- Se o core precisa mudar para atender o cliente, a mudança nasce no `os-core` e desce por merge.

## Manutenção mensal

```bash
git fetch upstream
git checkout -b chore/upstream-$(date +%Y-%m) develop
git merge upstream/main          # conflitos só aparecem se a regra acima foi quebrada
cd apps/api && ./gradlew test    # inclui ModularityTests
cd ../.. && pnpm install && pnpm lint && pnpm check-types && pnpm build
```

Faça o merge na `develop` do fork (branch a partir dela), revise as notas de versão do core (`CHANGELOG.md`, em especial "Ação necessária no fork", e as mensagens de commit `feat!:`), valide e leve para a `main` por PR. O deploy faz backup antes de atualizar.

## Checklist de entrega ao cliente

- [ ] Repositório criado por clone e push, `upstream` configurado, `dependabot.yml` removido, alertas de segurança do Dependabot ativos, CI verde.
- [ ] Actions liberadas em Settings > Actions > General do repositório (ou da organização do cliente): "Allow <org>, and select non-<org>, actions and reusable workflows", "Require actions to be pinned to a full-length commit SHA" e, em "Allow specified actions", exatamente as actions dos workflows: `actions/checkout@*`, `actions/setup-java@*`, `actions/setup-node@*`, `actions/upload-artifact@*`, `gradle/actions/setup-gradle@*`, `pnpm/action-setup@*`, `docker/setup-buildx-action@*`, `docker/login-action@*`, `docker/build-push-action@*`, `anchore/scan-action@*`. Uma organização que só permite actions locais faz o CI falhar antes de começar ("startup_failure"); uma action nova nos workflows do core entra nessa lista no merge mensal (nota em "Ação necessária no fork").
- [ ] Nossos acessos: colaboradores `Maintain` no GitHub, administradores no inventário do Ansible; nenhum `Owner`.
- [ ] Preset aplicado; nome do portal e domínio definidos; SPF, DKIM e DMARC do remetente.
- [ ] Servidor preparado pelo playbook; snapshots e backups automáticos do provedor desligados ou registrados com o cliente; resposta do provedor sobre criptografia do disco registrada.
- [ ] Deploy contínuo configurado (`DEPLOY_HOST`, `DEPLOY_URL`, `DEPLOY_HOST_KEY`, `DEPLOY_SSH_KEY`) e um rollback testado pelo Run workflow.
- [ ] Entrada em produção feita (`deploy.md`): banco, backups e segredos da fase de testes apagados e gerados de novo.
- [ ] Primeiro administrador criado, senha trocada e segundo fator cadastrado no primeiro login, `OS_BOOTSTRAP_*` removidos do `.env`.
- [ ] Backup diário rodando, cópia fora do servidor (`BACKUP_UPLOAD_CMD`), chave privada do `age` e cópia da chave de MFA no cofre do cliente, restauração testada.
- [ ] Monitores de disponibilidade, backup, teste mensal de restauração e disco com alerta para o responsável do cliente; horário de reinício automático (`os_reboot_time`) combinado com o cliente.
- [ ] Revisão de segurança do `security-baseline.md` executada sobre os módulos do cliente.
- [ ] Registro das operações de tratamento (LGPD art. 37) preenchido com os dados que os módulos do cliente guardam.

## Fim do contrato

Ao sair, deixe o cliente sem nenhuma dependência nossa e sem nenhum acesso nosso:

- [ ] Remover nossos usuários do GitHub do cliente (colaboradores externos) e da conta da Anthropic, do SMTP e do provedor, se tivermos entrado.
- [ ] Rodar o playbook com o inventário só com os administradores do cliente (a lista de chaves é a lista inteira: as nossas saem do servidor).
- [ ] Trocar o par do CD: nova chave no inventário (`os_ci_deploy_public_key`) e no secret `DEPLOY_SSH_KEY`.
- [ ] Trocar a chave da Anthropic e a senha do SMTP, se as vimos; trocar as senhas do banco se o cliente pedir (`deploy.md`, "Segredos").
- [ ] Entregar ao cliente o inventário do Ansible e a documentação; confirmar que ele tem a chave privada do backup e a cópia da chave de MFA.
