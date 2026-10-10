# Trocar a marca desta demo (consultoria)

A demo é do nicho, não de uma empresa: serve para qualquer consultoria (gestão e processos, compliance e LGPD, meio ambiente, estratégia, pessoas). Por padrão ela é genérica: o site e a barra lateral se chamam **CoreOS**, as frases falam em "sua empresa", o time usa e-mails `@empresa.com.br` e quem entra aparece só como "User". O vídeo grava esse sistema genérico; a parte personalizada é só a abertura.

Se um dia precisar da demo com a cara de um lead, só três coisas mudam:

| O quê | Onde |
|---|---|
| Nome, nome completo, descrição de uma linha, domínio de e-mail, quem faz login (nome e cargo), frases da tela de login | `apps/web/src/core/brand.ts` (objeto `COMPANY`) |
| Cor da marca (e a cor do texto em cima dela) | `apps/web/src/app/brand.css` (`--brand` e `--brand-foreground`) |
| Logo | arquivo em `apps/web/public/brand/` e `COMPANY.logo = "/brand/arquivo.png"`. Sem logo, `logo: null` desenha o nome em texto |

Todo o resto (menu, login, título da aba, e-mails do time, o assistente) lê desses três lugares.

## O prompt pronto

```
Personaliza a demo consultoria (os-core-demos/consultoria-demo) pra {Empresa}:
nome curto {Nome}, nome completo {Nome completo}, o que ela faz em uma linha {descrição},
domínio {dominio.com.br}, login como {Primeiro} {Sobrenome} ({cargo}),
cor da marca {#hex} e logo em {caminho do arquivo ou "sem logo"}.
Mexe só em brand.ts, brand.css e public/brand/, reinicia o servidor e me mostra a tela inicial.
```

Se o logo é escuro (preto no transparente), deixar `logoIsDark: true`: ele é invertido no painel colorido do login e no modo escuro. Se é claro ou colorido, `false`.

## O que a demo mostra

- **Painel:** o aviso de destaque são os combinados de reunião que não viraram tarefa ("na reunião de terça, a Ponte Alta fez 3 pedidos e ninguém ficou responsável"), com o trecho da transcrição e um botão que cria as tarefas. Ao lado, os projetos que terminam em 15 dias sem proposta de continuidade.
- **Operacional:** Projetos (cliente, fase, entregas, continuidade), Horas (lançado contra o orçado, projeção e quem não lançou a semana), Reuniões (o que foi combinado em cada uma, com quem ficou), Entregáveis e Tarefas.
- **Pergunta do vídeo:** "O que a Ponte Alta pediu nas últimas três reuniões e o que ainda está pendente?". Funciona com qualquer cliente do seed (Vitalis, Três Pinheiros, Campo Firme...). Depois, "pode criar" abre o cartão de aprovação das tarefas.

Os dados ficam em `apps/web/src/mock/consultoria.ts` (projetos, reuniões, combinados, entregáveis, horas) e `apps/web/src/mock/empresa.ts` (Comercial, Financeiro, Automações, Integrações). As reuniões caem sempre no mesmo dia da semana contado a partir de hoje, então "a reunião de terça" continua certa em qualquer dia de gravação.

## Rodar

Pelo Claude Code no vault: preview `consultoria-demo-os` (porta 8080). Na mão:

```bash
cd apps/web && ./node_modules/.bin/next dev -p 8080
```

Qualquer senha entra. Os dados ficam em memória: o que muda durante a gravação (tarefas criadas, combinados que ganharam dono) some quando o servidor reinicia, e mudança no seed só aparece reiniciando. Antes de gravar, reinicie o servidor para o aviso voltar com os 6 combinados sem responsável. Com `ANTHROPIC_API_KEY` em `apps/web/.env.local` o assistente responde pela API de verdade; pedir pra criar tarefas cai sempre no fluxo roteirizado, pra mostrar o cartão de aprovação.

## Voltar pro genérico

`name: "CoreOS"`, `fullName: "sua empresa"`, `domain: "empresa.com.br"`, `owner: { first: "User", last: "", role: "Administrador" }`, `logo: null`.
