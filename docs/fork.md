# Fork de cliente

Cada cliente recebe um repositório próprio (`<cliente>-os`), criado como fork do `os-core`. O cliente é dono desse repositório e pode sair com ele a qualquer momento. O contrato de manutenção mensal consiste em trazer o `os-core` atualizado para o fork e validar.

## Criar o fork

```bash
git clone git@github.com:MaximusFlow/os-core.git cliente-os && cd cliente-os
git remote rename origin upstream
git remote add origin git@github.com:<org-do-cliente>/cliente-os.git
git push -u origin main
```

Depois, no fork:

1. Identidade visual: `cd apps/web && pnpm dlx shadcn@latest apply --preset <codigo>`. Nenhum componente é editado à mão.
2. Nome do portal: `OS_MAIL_PORTAL_NAME` e o título em `apps/web/src/core/shell/AppShell.tsx` (único ponto com o texto "OS").
3. Módulos de negócio: siga `new-module.md`. O módulo de exemplo `tasks` pode ficar ou ser removido (pacote `com.maximusflow.os.tasks`, migração `V6__tasks.sql` só se o banco ainda não existe, `src/modules/tasks`, entrada em `src/modules/navigation.ts`, rota `src/app/(os)/tasks`).
4. Deploy: `deploy.md`.

## Regras que mantêm o merge limpo

- O fork nunca edita `common`, `auth`, `iam`, `ai` nem `src/core` e `src/components/ui` do web. Personalização entra por `application.yml`, variáveis de ambiente, beans próprios, eventos e módulos do cliente.
- Migrações do cliente começam em `V100__` para nunca colidir com as do core.
- Se o core precisa mudar para atender o cliente, a mudança nasce no `os-core` e desce por merge.

## Manutenção mensal

```bash
git fetch upstream
git checkout -b chore/upstream-$(date +%Y-%m) main
git merge upstream/main          # conflitos só aparecem se a regra acima foi quebrada
cd apps/api && ./gradlew test    # inclui ModularityTests
cd ../.. && pnpm install && pnpm lint && pnpm check-types && pnpm build
```

Abra PR no fork, revise as notas de versão do core (breaking changes ficam em `docs/architecture.md` e nas mensagens de commit `feat!:`), faça deploy em homologação, depois produção conforme `deploy.md` (backup antes).

## Checklist de entrega ao cliente

- [ ] Fork criado, `upstream` configurado, CI verde.
- [ ] Preset aplicado; nome do portal e domínio definidos.
- [ ] `deploy/.env` preenchido no servidor com senha forte do banco, chave da Anthropic e SMTP do cliente.
- [ ] Primeiro administrador criado, senha trocada no primeiro login, `OS_BOOTSTRAP_*` removidos do `.env`.
- [ ] Backup agendado e restauração testada.
- [ ] Revisão de segurança do `security-baseline.md` executada sobre os módulos do cliente.
- [ ] Registro das operações de tratamento (LGPD art. 37) preenchido com os dados que os módulos do cliente guardam.
