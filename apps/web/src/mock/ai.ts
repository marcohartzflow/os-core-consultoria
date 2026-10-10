// Scripted assistant of the demonstration: reads the mock store and answers in the same SSE frames the
// real agent sends (token, tool_start, tool_call, action_pending, ui_action, done), so the chat UI,
// tool timeline and approval cards behave exactly as they will with the model behind them.
import type { ChatMessage } from "@/core/api/types";
import type { Combinado, Projeto, Reuniao } from "@/modules/consultoria/types";
import { db, me, audit, type PendingAction, type StoredConversation } from "./db";
import {
  combinadosParaTarefas,
  computeAvisos,
  computeHoras,
  computeResumo,
  daysUntil,
  diaUtil,
  FRENTE_LABEL,
  isoDay,
  listEntregaveis,
  listProjetos,
  listReunioes,
  lower,
  META_MARGEM,
  ORIGEM_LABEL,
  shortDay,
} from "./consultoria";
import { claudeEnabled, claudeTurn } from "./claude";
import { EQUIPE } from "@/modules/consultoria/team";

export type Frame = { event: string; data: Record<string, unknown> };

interface NewTask {
  titulo: string;
  descricao: string;
  responsavel: string;
  prazo: string;
}

interface Script {
  tools: string[];
  text: string;
  navigate?: { path: string; label: string };
  action?: { tool: string; summary: string; arguments: Record<string, unknown>; apply: () => string };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlMil = (value: number) =>
  value >= 1_000 ? `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(value);
const first = (name: string) => name.split(" ")[0];
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a, b e c". */
const junta = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "terça, 06/10". */
const dia = (iso: string) => `${DIAS[new Date(`${iso}T12:00:00`).getDay()]}, ${shortDay(iso)}`;
const quando = (iso: string) => {
  const d = daysUntil(iso);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
};

const projetos = () => listProjetos(db);

/** "sócia" or "sócio", from the person's cargo. */
const papelDe = (nome: string) => (EQUIPE.find((e) => e.nome === nome)?.cargo.split(" ")[0] ?? "Sócio").toLowerCase();

/** The project a text talks about: the client by nickname or by full name. */
function projetoIn(text: string): Projeto | null {
  const t = ` ${norm(text).replace(/[^a-z0-9]+/g, " ")} `;
  const mentions = (name: string) => t.includes(` ${norm(name).replace(/[^a-z0-9]+/g, " ").trim()} `);
  const cliente = db.clientes.find((c) => mentions(c.apelido) || mentions(c.nome));
  if (!cliente) return null;
  return projetos().find((p) => p.clienteId === cliente.id) ?? null;
}

const PEDIDOS_RE = /pedi|reuni|pendent|pendenc|combin|falt|ficou|prometemos|acordad|cobrou|quer\b|querem/;
const ORFAO_RE = /sem respons|sem dono|ninguem|nao vir\w* tarefa|combinad|pedidos? (de|dos) clientes?/;
const CONTINUIDADE_RE = /continuidade|renova|terminand|termina|acaband|acaba|encerr|fim do contrato|depois do projeto/;
const HORAS_RE = /\bhoras?\b|orcad|estour|margem|aditivo/;
const ENTREGA_RE = /entreg/;

// ---- the video question: what a client asked in the last meetings ----------------------------------

const NUMERO = ["", "Na última reunião", "Nas duas últimas reuniões", "Nas últimas três reuniões"];

/** One item as the answer lists it, with what became of it. */
function linhaCombinado(c: Combinado) {
  switch (c.status) {
    case "FEITO":
      return `- **Feito:** ${c.texto}. ${first(c.responsavel ?? "")}${c.feitoEm ? `, ${shortDay(c.feitoEm)}` : ""}: ${lower(c.feito ?? "tarefa concluída")}.`;
    case "EM_ANDAMENTO":
      return `- **Com ${first(c.responsavel ?? "")}, prazo ${shortDay(c.prazo!)}:** ${c.texto}.`;
    case "ATRASADO":
      return `- **Atrasado, com ${first(c.responsavel ?? "")}:** ${c.texto} (o prazo era ${shortDay(c.prazo!)}).`;
    case "SEM_RESPONSAVEL":
      return `- **Sem responsável:** ${c.texto} (${first(c.pedidoPor)}${c.trecho ? `, aos ${c.minuto} min: “${c.trecho}”` : ""}).`;
  }
}

const ORDEM_PENDENTE = { SEM_RESPONSAVEL: 0, ATRASADO: 1, EM_ANDAMENTO: 2, FEITO: 3 } as const;

function pedidosDoCliente(p: Projeto): Script {
  const reunioes = listReunioes(db).filter((r) => r.projetoId === p.id).slice(0, 3);
  const todos = reunioes.flatMap((r) => r.combinados);
  const feitos = todos.filter((c) => c.status === "FEITO");
  const comAlguem = todos.filter((c) => c.status === "EM_ANDAMENTO" || c.status === "ATRASADO");
  const atrasados = todos.filter((c) => c.status === "ATRASADO");
  const orfaos = todos.filter((c) => c.status === "SEM_RESPONSAVEL");
  const pendentes = [...comAlguem, ...orfaos].sort((a, b) => ORDEM_PENDENTE[a.status] - ORDEM_PENDENTE[b.status]);
  const reuniaoDe = (c: Combinado) => reunioes.find((r) => r.id === c.reuniaoId)!;

  const blocos = reunioes.map((r) => {
    const doCliente = r.participantes.filter((x) => x.lado === "CLIENTE").map((x) => first(x.nome));
    return `**${upper(dia(r.data))} · ${r.titulo}** (transcrição do ${ORIGEM_LABEL[r.origem]}, com ${junta(doCliente)})

${r.combinados.map(linhaCombinado).join("\n")}`;
  });

  const tabela = pendentes.length
    ? `**O que ainda está pendente**

| Pedido | Reunião | Com quem |
|---|---|---|
${pendentes
  .map((c) => {
    const com =
      c.status === "SEM_RESPONSAVEL"
        ? "**ninguém**"
        : c.status === "ATRASADO"
          ? `${first(c.responsavel ?? "")}, atrasado (venceu ${shortDay(c.prazo!)})`
          : `${first(c.responsavel ?? "")}, até ${shortDay(c.prazo!)}`;
    return `| ${c.texto} | ${shortDay(reuniaoDe(c).data)} | ${com} |`;
  })
  .join("\n")}`
    : "Tudo o que foi pedido nessas reuniões já foi feito.";

  const impactos = orfaos.filter((c) => c.impacto);
  const renovacao = computeAvisos(db).continuidade.projetos.find((a) => a.projetoId === p.id);
  const depois = renovacao
    ? `\n\n**E a renovação:** o projeto termina ${quando(renovacao.fim)} (${shortDay(renovacao.fim)}) sem proposta de continuidade.${renovacao.evento ? ` ${renovacao.evento.fonte}: ${renovacao.evento.texto}` : ""} Sugestão: ${lower(renovacao.sugestao)}, ${brl(renovacao.valorMensal)}/mês.`
    : "";
  const atencao = impactos.length ? `\n\n**O mais urgente:** ${impactos.map((c) => `${apelidoDoItem(c.texto)}. ${c.impacto}.`).join(" ")}` : "";

  // Suggested owners, grouped: "Camila (alçada e visita técnica)".
  const porDono = [...new Set(orfaos.map((c) => c.sugerido))].map(
    (nome) => `${first(nome)} (${junta(orfaos.filter((c) => c.sugerido === nome).map((c) => apelidoDoItem(c.texto)))})`,
  );
  const fecho = orfaos.length
    ? `Quer que eu crie ${orfaos.length === 1 ? "a tarefa que está sem responsável" : `as ${orfaos.length} tarefas que estão sem responsável`}? Sugiro ${junta(porDono)}, ${orfaos.length === 1 ? "com prazo" : "cada uma com prazo"}. Você aprova antes de eu criar.`
    : renovacao
      ? `Nos pedidos, nada ficou sem dono. Quer que eu crie a tarefa para ${first(renovacao.socio)} montar a proposta de continuidade a partir do modelo?`
      : atrasados.length
        ? `Nada ficou sem dono. O ponto de atenção é ${lower(atrasados[0].texto)}, atrasado com ${first(atrasados[0].responsavel ?? "")}.`
        : "Nada ficou sem dono e nada está atrasado.";

  const resumo = [
    plural(feitos.length, "já foi feito", "já foram feitos"),
    `${plural(comAlguem.length, "está com alguém", "estão com alguém")}${atrasados.length ? ` (${plural(atrasados.length, "atrasado", "atrasados")})` : ""}`,
  ];
  return {
    tools: ["consultoria_reunioes", "tasks_list", "consultoria_projetos"],
    navigate: { path: `/reunioes?cliente=${encodeURIComponent(p.apelido)}`, label: `Reuniões da ${p.apelido}` },
    text: `${NUMERO[reunioes.length] ?? NUMERO[3]} com a **${p.apelido}**, o cliente fez **${plural(todos.length, "pedido", "pedidos")}**: ${resumo.join(", ")} e ${orfaos.length ? `**${plural(orfaos.length, "não tem responsável", "não têm responsável")}**` : "nenhum ficou sem responsável"}.

${blocos.join("\n\n")}

${tabela}${atencao}${depois}

${fecho}`,
  };
}

/** Short form of an item for the owner suggestion: "enviar o comparativo de lead time". */
function apelidoDoItem(texto: string) {
  return lower(texto.replace(/\s+(antes|no|na|com|dos|para)\s.*$/i, ""));
}

// ---- other answers ------------------------------------------------------------------------------

function sobreProjeto(p: Projeto): Script {
  const reunioes = listReunioes(db).filter((r) => r.projetoId === p.id);
  const pendentes = reunioes.flatMap((r) => r.combinados).filter((c) => c.status !== "FEITO");
  const orfaos = pendentes.filter((c) => c.status === "SEM_RESPONSAVEL");
  const mensal = p.cobranca === "MENSAL";
  const horas = mensal
    ? `${p.horasLancadas}h por mês, em média, de ${p.horasOrcadas}h orçadas`
    : `${p.horasLancadas}h lançadas de ${p.horasOrcadas}h orçadas, com ${p.concluido}% feito (projeção de ${p.horasProjetadas}h, ${p.estouro > 0 ? "+" : ""}${p.estouro}%)`;
  const e = p.entregas;
  const proxima = !e.proxima
    ? ""
    : daysUntil(e.proxima.prazo) < 0
      ? `; ${lower(e.proxima.nome)} está atrasada desde ${shortDay(e.proxima.prazo)}`
      : `; a próxima é ${lower(e.proxima.nome)}, ${quando(e.proxima.prazo)} (${shortDay(e.proxima.prazo)})`;
  const c = p.continuidade;
  const continuidade =
    c.status === "SEM_PROPOSTA"
      ? `Termina ${quando(p.fim)} (${shortDay(p.fim)}) e ainda não tem proposta de continuidade${c.texto ? `. Sugestão: ${lower(c.texto)}, ${brl(c.valorMensal ?? 0)}/mês` : ""}.`
      : c.status === "RECORRENTE"
        ? `${c.texto}.`
        : `Continuidade: ${lower(c.texto ?? "")}${c.evento ? ` (${lower(c.evento.fonte)})` : ""}.`;
  return {
    tools: ["consultoria_projetos", "consultoria_reunioes", "consultoria_horas"],
    navigate: { path: `/projetos?ficha=${p.id}`, label: `Ficha: ${p.apelido}` },
    text: `**${p.nome}** (${FRENTE_LABEL[p.frente]}, ${p.cliente}). Gerente: ${p.responsavel}; ${papelDe(p.socio)}: ${p.socio}.

- **Fase:** ${lower(p.faseDetalhe)}. ${p.entregas.entregues} de ${p.entregas.total} entregas feitas${proxima}.
- **Horas:** ${horas}. Margem de ${p.margemAtual}% (orçada: ${p.margemPlanejada}%, meta: ${META_MARGEM}%).
- **Combinados:** ${pendentes.length ? `${plural(pendentes.length, "em aberto", "em aberto")}${orfaos.length ? `, **${plural(orfaos.length, "sem responsável", "sem responsável")}**: ${junta(orfaos.map((x) => lower(x.texto)))}` : ", todos com responsável"}` : "nada em aberto"}.
- **Depois do contrato:** ${continuidade}
${p.causas ? `\n**Para onde foram as horas a mais**\n\n${p.causas.map((x) => `- +${x.horas}h: ${x.texto} (${x.fonte})`).join("\n")}\n` : ""}
**Sugestão:** ${p.acaoSugerida}${orfaos.length ? " Quer que eu crie as tarefas dos combinados sem responsável?" : ""}`,
  };
}

function listaOrfaos(): Script {
  const a = computeAvisos(db).combinados;
  if (!a.total) {
    return { tools: ["consultoria_avisos"], text: "Nenhum combinado de reunião está sem responsável: cada pedido virou tarefa com dono e prazo." };
  }
  const blocos = a.grupos.map(
    (g) => `**${g.reuniao.apelido} · ${lower(g.reuniao.fonte)}** (${g.reuniao.titulo})

${g.itens.map((c) => `- ${c.texto}${c.trecho ? `. ${first(c.pedidoPor)}, aos ${c.minuto} min: “${c.trecho}”` : ""}${c.impacto ? ` **${c.impacto}.**` : ""} Sugestão: ${first(c.sugerido)}, até ${shortDay(c.prazoSugerido)}.`).join("\n")}`,
  );
  return {
    tools: ["consultoria_avisos", "consultoria_reunioes", "tasks_list"],
    navigate: { path: "/reunioes?pendencia=SEM_RESPONSAVEL", label: "Reuniões com combinado sem responsável" },
    text: `**${plural(a.total, "combinado", "combinados")} de reunião não ${a.total === 1 ? "virou" : "viraram"} tarefa**, em ${plural(a.reunioes, "reunião", "reuniões")} com ${junta(a.clientes)}. Ninguém assumiu na hora e ninguém assumiu depois:

${blocos.join("\n\n")}

Quer que eu crie as ${a.total} tarefas com esses responsáveis e prazos? Você aprova antes.`,
  };
}

function listaContinuidade(): Script {
  const c = computeAvisos(db).continuidade;
  const lista = projetos();
  const enviadas = lista.filter((p) => p.cobranca === "FIXO" && daysUntil(p.fim) <= 30 && p.continuidade.status === "PROPOSTA_ENVIADA");
  const logo = lista.filter(
    (p) => p.cobranca === "FIXO" && p.continuidade.status === "SEM_PROPOSTA" && daysUntil(p.fim) > c.janelaDias && daysUntil(p.fim) <= 30,
  );
  const rows = c.projetos
    .map((a) => `| ${a.apelido} | ${shortDay(a.fim)} (${quando(a.fim)}) | ${lower(a.sugestao)} | ${brl(a.valorMensal)}/mês | ${first(a.socio)} |`)
    .join("\n");
  return {
    tools: ["consultoria_avisos", "consultoria_projetos"],
    navigate: { path: "/projetos?aviso=SEM_CONTINUIDADE", label: "Projetos sem continuidade" },
    text: c.projetos.length
      ? `**${plural(c.projetos.length, "projeto termina", "projetos terminam")} em até ${c.janelaDias} dias sem proposta de continuidade**: ${brlMil(c.valorAno)} por ano de renovação que ninguém pediu ainda.

| Projeto | Termina | Continuidade sugerida | Valor | Sócio |
|---|---|---|---|---|
${rows}

**O cliente já deu a deixa**

${c.projetos.map((a) => `- **${a.apelido}**, ${lower(a.evento?.fonte ?? "")}: ${a.evento?.texto ?? ""}`).join("\n")}
${enviadas.length ? `\nJá com proposta: ${junta(enviadas.map((p) => `${p.apelido} (${lower(p.continuidade.texto ?? "")}, ${brl(p.continuidade.valorMensal ?? 0)}/mês, enviada)`))}.` : ""}${logo.length ? `\nLogo depois: ${junta(logo.map((p) => `${p.apelido} termina ${quando(p.fim)} e também não tem proposta`))}.` : ""}

Quer que eu crie as tarefas para os sócios montarem as propostas a partir do modelo? Elas ficam no Drive para revisão, nada vai ao cliente sem você aprovar.`
      : "Todo projeto que termina nos próximos 15 dias já tem proposta de continuidade.",
  };
}

function listaHoras(): Script {
  const h = computeHoras(db).projetos.filter((x) => x.cobranca === "FIXO" && x.estouro > 0);
  const acima = h.filter((x) => x.estouro >= 10);
  const total = h.reduce((s, x) => s + x.horasAcima, 0);
  const lista = projetos();
  const rows = h
    .map((x) => `| ${x.apelido} | ${x.horasOrcadas}h | ${x.horasLancadas}h | ${x.concluido}% | ${x.horasProjetadas}h (+${x.estouro}%) | ${x.margemAtual}% |`)
    .join("\n");
  return {
    tools: ["consultoria_horas", "consultoria_projetos"],
    navigate: { path: "/horas", label: "Horas por projeto" },
    text: `**${plural(acima.length, "projeto vai", "projetos vão")} fechar 10% ou mais acima das horas orçadas**, e no total são ${total}h a mais nos projetos de preço fechado.

| Projeto | Orçado | Lançado | Feito | Projeção | Margem |
|---|---|---|---|---|---|
${rows}

**Por que passou**

${acima
  .map((x) => {
    const p = lista.find((y) => y.id === x.projetoId)!;
    return `- **${x.apelido}:** ${(p.causas ?? []).map((c) => `+${c.horas}h, ${lower(c.texto)} (${lower(c.fonte)})`).join("; ")}.`;
  })
  .join("\n")}

**Sugestão:** ${acima.map((x) => `${x.apelido}: ${lower(db.projetos.find((y) => y.id === x.projetoId)!.acaoSugerida)}`).join(" ")} Quer que eu crie as tarefas de aditivo para os sócios?`,
  };
}

function listaEntregas(): Script {
  const e = listEntregaveis(db);
  const atrasados = e.filter((x) => x.status === "ATRASADO");
  const proximos = e
    .filter((x) => (x.status === "EM_ANDAMENTO" || x.status === "NAO_INICIADO") && daysUntil(x.prazo) <= 15)
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
  const cliente = e.filter((x) => x.status === "APROVACAO_CLIENTE");
  return {
    tools: ["consultoria_entregaveis"],
    navigate: { path: "/entregaveis", label: "Entregáveis" },
    text: `${atrasados.length ? `**${plural(atrasados.length, "entregável atrasado", "entregáveis atrasados")}:**\n\n${atrasados.map((x) => `- ${x.nome} · ${x.apelido}, com ${first(x.responsavel)}, venceu ${quando(x.prazo)}`).join("\n")}\n\n` : "Nenhum entregável atrasado.\n\n"}**Vencem em 15 dias (${proximos.length}):**

${proximos.map((x) => `- ${x.nome} · ${x.apelido}, com ${first(x.responsavel)}, ${shortDay(x.prazo)} (${quando(x.prazo)})`).join("\n")}
${cliente.length ? `\n**Com o cliente para aprovar:** ${junta(cliente.map((x) => `${lower(x.nome)} (${x.apelido})`))}.` : ""}`,
  };
}

function tarefas(): Script {
  const hoje = isoDay(0);
  const atrasadas = db.tasks
    .filter((t) => t.status === "OPEN" && t.dueDate !== null && t.dueDate < hoje)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  return {
    tools: ["tasks_list"],
    navigate: { path: "/tasks?status=OPEN", label: "Tarefas abertas" },
    text: atrasadas.length
      ? `Há **${plural(atrasadas.length, "tarefa atrasada", "tarefas atrasadas")}**:

${atrasadas.map((t) => `- ${t.title} · com ${t.assignee?.name ?? "ninguém"} · prazo ${shortDay(t.dueDate!)} (${quando(t.dueDate!)})`).join("\n")}

Fora delas, ${plural(computeAvisos(db).combinados.total, "combinado de reunião ainda não tem", "combinados de reunião ainda não têm")} tarefa nenhuma: esses nem aparecem como atrasados.`
      : "Nenhuma tarefa atrasada. Todas as tarefas abertas estão dentro do prazo.",
  };
}

function saudacao() {
  const hora = new Date().getHours();
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

function briefing(): Script {
  const r = computeResumo(db);
  const avisos = computeAvisos(db);
  const impacto = avisos.combinados.grupos.flatMap((g) => g.itens).find((c) => c.impacto);
  const acima = computeHoras(db).projetos.filter((x) => x.cobranca === "FIXO" && x.estouro >= 10);
  const atrasados = listEntregaveis(db).filter((x) => x.status === "ATRASADO");
  const hoje = isoDay(0);
  const tarefasAtrasadas = db.tasks.filter((t) => t.status === "OPEN" && t.dueDate !== null && t.dueDate < hoje);
  const myTasks = db.tasks
    .filter((t) => t.status === "OPEN" && t.assignee?.id === me().id)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const linhas = [
    avisos.combinados.total
      ? `- **${plural(avisos.combinados.total, "combinado de reunião sem responsável", "combinados de reunião sem responsável")}**, em ${plural(avisos.combinados.reunioes, "reunião", "reuniões")} (${junta(avisos.combinados.clientes)}).${impacto ? ` O mais sensível: ${lower(impacto.texto)}, da ${impacto.apelido}. ${impacto.impacto}.` : ""}`
      : "- Todo combinado de reunião tem responsável.",
    avisos.continuidade.projetos.length
      ? `- **${plural(avisos.continuidade.projetos.length, "projeto termina", "projetos terminam")} em até ${avisos.continuidade.janelaDias} dias sem proposta de continuidade**: ${junta(avisos.continuidade.projetos.map((a) => `${a.apelido} (${quando(a.fim)})`))}, ${brlMil(avisos.continuidade.valorAno)} por ano de renovação.`
      : "",
    acima.length
      ? `- **Horas:** ${junta(acima.map((x) => `${x.apelido} (+${x.estouro}%)`))} ${acima.length === 1 ? "vai" : "vão"} fechar acima do orçado; ${r.horasAcima}h a mais no total.`
      : "",
    `- **Entregas:** ${atrasados.length ? `${plural(atrasados.length, "atrasada", "atrasadas")} (${junta(atrasados.map((x) => `${lower(x.nome)}, da ${x.apelido}`))}), ` : ""}${r.proximas15} vencem em 15 dias.`,
    tarefasAtrasadas.length ? `- **${plural(tarefasAtrasadas.length, "tarefa atrasada", "tarefas atrasadas")}** no time.` : "",
    r.pessoasSemLancar ? `- **${plural(r.pessoasSemLancar, "pessoa não lançou", "pessoas não lançaram")}** a semana passada inteira (${r.horasSemLancar}h faltando); o lembrete já foi.` : "",
  ].filter(Boolean);
  const principal = avisos.combinados.grupos[0]?.reuniao.apelido;
  return {
    tools: ["consultoria_avisos", "consultoria_horas", "consultoria_entregaveis", "tasks_list"],
    text: `${saudacao()}, ${first(me().name)}. O que pede atenção hoje:

${linhas.join("\n")}

**Suas tarefas abertas (${myTasks.length}):**

${myTasks.map((t) => `- ${t.title}${t.dueDate ? ` · prazo ${shortDay(t.dueDate)}` : ""}`).join("\n")}

Por onde quer começar: ${principal ? `os pedidos da ${principal} ou ` : ""}as renovações?`,
  };
}

// ---- tasks through the approval card --------------------------------------------------------------

type Topic = { projeto: Projeto } | { kind: "orfaos" | "continuidade" | "horas" };

/** What the conversation was about before this message, to know which tasks "cria as tarefas" means. */
function topicOf(conversation: StoredConversation): Topic {
  const previous = conversation.messages.slice(0, -1).reverse();
  for (const message of previous) {
    if (message.role !== "user") continue;
    const p = projetoIn(message.text);
    if (p) return { projeto: p };
    const text = norm(message.text);
    if (ORFAO_RE.test(text)) return { kind: "orfaos" };
    if (CONTINUIDADE_RE.test(text)) return { kind: "continuidade" };
    if (HORAS_RE.test(text)) return { kind: "horas" };
  }
  return { kind: "orfaos" };
}

interface Plano {
  intro: string;
  resumo: string;
  list: NewTask[];
  /** Orphan items to turn into tasks (they keep the link to the meeting); null for plain tasks. */
  combinados: string[] | null;
}

function planoOrfaos(itens: Combinado[], de: string): Plano {
  const donos = [...new Set(itens.map((c) => first(c.sugerido)))];
  return {
    intro: `Vou criar ${plural(itens.length, "tarefa", "tarefas")} ${de}, ${itens.length === 1 ? "com o responsável e o prazo sugeridos" : `para ${junta(donos)}, cada uma com prazo`}. A tarefa leva o trecho da transcrição, para quem pegar saber exatamente o que o cliente pediu.`,
    resumo: `Criar ${plural(itens.length, "tarefa", "tarefas")} dos combinados sem responsável ${de} (${junta(donos)})`,
    list: itens.map((c) => ({ titulo: `${c.texto} · ${c.apelido}`, descricao: c.fonte, responsavel: c.sugerido, prazo: c.prazoSugerido })),
    combinados: itens.map((c) => c.id),
  };
}

function tarefasPara(conversation: StoredConversation): Plano {
  const topic = topicOf(conversation);
  const orfaos = (filtro?: (c: Combinado) => boolean) =>
    listReunioes(db)
      .flatMap((r: Reuniao) => r.combinados)
      .filter((c) => c.status === "SEM_RESPONSAVEL" && (!filtro || filtro(c)));

  if ("projeto" in topic) {
    const p = topic.projeto;
    const itens = orfaos((c) => c.projetoId === p.id);
    if (itens.length) return planoOrfaos(itens, `da ${p.apelido}`);
    const renovacao = computeAvisos(db).continuidade.projetos.find((a) => a.projetoId === p.id);
    if (renovacao) {
      return {
        intro: `Vou criar a tarefa para ${renovacao.socio} montar a proposta de continuidade a partir do modelo. Ela fica no Drive para revisão.`,
        resumo: `Criar 1 tarefa de proposta de continuidade para ${first(renovacao.socio)} (${p.apelido})`,
        list: [
          {
            titulo: `Montar proposta de continuidade: ${lower(renovacao.sugestao)} (${brl(renovacao.valorMensal)}/mês) · ${p.apelido}`,
            descricao: `Projeto termina em ${shortDay(renovacao.fim)}. ${renovacao.evento ? `${renovacao.evento.fonte}: ${renovacao.evento.texto}` : ""}`,
            responsavel: renovacao.socio,
            prazo: diaUtil(Math.max(1, Math.min(3, renovacao.dias - 5))),
          },
        ],
        combinados: null,
      };
    }
    return {
      intro: `Vou criar a tarefa para ${p.responsavel} com a ação sugerida.`,
      resumo: `Criar 1 tarefa para ${first(p.responsavel)} (${p.apelido})`,
      list: [{ titulo: `Ação sugerida pela IA · ${p.apelido}`, descricao: p.acaoSugerida, responsavel: p.responsavel, prazo: diaUtil(2) }],
      combinados: null,
    };
  }
  if (topic.kind === "continuidade") {
    const c = computeAvisos(db).continuidade.projetos;
    return {
      intro: `Vou criar ${plural(c.length, "tarefa", "tarefas")} para ${junta([...new Set(c.map((a) => first(a.socio)))])} ${c.length === 1 ? "montar a proposta" : "montarem as propostas"} a partir do modelo. A automação de propostas deixa o documento no Drive para revisão.`,
      resumo: `Criar ${plural(c.length, "tarefa", "tarefas")} de proposta de continuidade (${junta(c.map((a) => a.apelido))})`,
      list: c.map((a) => ({
        titulo: `Montar proposta de continuidade: ${lower(a.sugestao)} (${brl(a.valorMensal)}/mês) · ${a.apelido}`,
        descricao: `Projeto termina em ${shortDay(a.fim)}. ${a.evento ? `${a.evento.fonte}: ${a.evento.texto}` : ""}`,
        responsavel: a.socio,
        prazo: diaUtil(Math.max(1, Math.min(3, a.dias - 5))),
      })),
      combinados: null,
    };
  }
  if (topic.kind === "horas") {
    const acima = projetos().filter((p) => p.cobranca === "FIXO" && p.estouro >= 10);
    return {
      intro: `Vou criar ${plural(acima.length, "tarefa", "tarefas")} para os sócios proporem aditivo pelas horas que entraram fora da proposta.`,
      resumo: `Criar ${plural(acima.length, "tarefa", "tarefas")} de aditivo (${junta(acima.map((p) => p.apelido))})`,
      list: acima.map((p) => ({
        titulo: `Propor aditivo pelas horas fora da proposta · ${p.apelido}`,
        descricao: `${p.horasLancadas}h lançadas de ${p.horasOrcadas}h, ${p.concluido}% feito, projeção de ${p.horasProjetadas}h. ${(p.causas ?? []).map((c) => `+${c.horas}h: ${c.texto} (${c.fonte})`).join("; ")}.`,
        responsavel: p.socio,
        prazo: diaUtil(3),
      })),
      combinados: null,
    };
  }
  return planoOrfaos(orfaos(), "das reuniões");
}

const who = (name: string) => {
  const user = db.users.find((u) => u.name === name);
  return user ? { id: user.id, name: user.name } : null;
};

function criarTarefas(conversation: StoredConversation): Script {
  const { intro, resumo, list, combinados } = tarefasPara(conversation);
  if (!list.length) {
    return { tools: ["consultoria_avisos"], text: "Não há nada sem responsável agora: cada combinado já virou tarefa com dono e prazo." };
  }
  return {
    tools: ["consultoria_reunioes"],
    text: intro,
    action: {
      tool: "tasks_create",
      summary: resumo,
      arguments: { tarefas: list.map((t) => ({ titulo: t.titulo, responsavel: t.responsavel, prazo: t.prazo })) },
      apply: () => {
        if (combinados) {
          const created = combinadosParaTarefas(db, combinados, who);
          for (const task of created) audit("consultoria.combinado.tarefa", "task", task.id, "AI_TOOL");
          return `${plural(created.length, "tarefa criada", "tarefas criadas")}`;
        }
        for (const t of list) {
          const now = new Date().toISOString();
          db.tasks.unshift({
            id: crypto.randomUUID(),
            title: t.titulo,
            description: t.descricao,
            assignee: who(t.responsavel),
            dueDate: t.prazo,
            status: "OPEN",
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          });
          audit("tasks.task.created", "task", null, "AI_TOOL");
        }
        return `${plural(list.length, "tarefa criada", "tarefas criadas")}`;
      },
    },
  };
}

const TASKS_RE =
  /\b(cria|crie|criar|gera|gere|gerar|abre|abra|abrir|cadastra|prepara|prepare|monta|monte)\b.*\b(tarefas?|propostas?)\b|^sim\b|pode criar|pode sim|pode fazer|pode preparar|manda ver|^bora\b|^ok\b|^fechado\b|^isso\b/;

function pick(conversation: StoredConversation, text: string): Script {
  const t = norm(text.trim());
  if (TASKS_RE.test(t)) return criarTarefas(conversation);
  const projeto = projetoIn(text);
  if (projeto) return PEDIDOS_RE.test(t) ? pedidosDoCliente(projeto) : sobreProjeto(projeto);
  if (ORFAO_RE.test(t)) return listaOrfaos();
  if (CONTINUIDADE_RE.test(t)) return listaContinuidade();
  if (/tarefa|atrasad/.test(t) && !ENTREGA_RE.test(t)) return tarefas();
  if (ENTREGA_RE.test(t)) return listaEntregas();
  if (HORAS_RE.test(t)) return listaHoras();
  return briefing();
}

/** Words of a text as streaming chunks, with the spacing kept. */
function chunks(text: string) {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function titleFor(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 48 ? clean.slice(0, 47) + "…" : clean;
}

/** Asking for tasks keeps the scripted flow, so the approval card shows up in the demo. */
const asksForTasks = (text: string) => TASKS_RE.test(norm(text.trim()));

export async function* runTurn(
  conversation: StoredConversation,
  text: string | null,
  model: string | null = null,
): AsyncGenerator<Frame> {
  if (claudeEnabled && text !== null && !asksForTasks(text)) {
    // Claude writes the answer; the screen still follows it, as the scripted answers do.
    const navigate = pick(conversation, text).navigate;
    for await (const frame of claudeTurn(conversation, model)) {
      if (frame.event === "done" && navigate) yield { event: "ui_action", data: { type: "navigate", ...navigate } };
      yield frame;
    }
    return;
  }
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  yield { event: "thinking", data: {} };
  await wait(500);

  // A continuation after an approval: tell what happened and stop.
  if (text === null) {
    const last = [...db.actions].reverse().find((a) => a.conversationId === conversation.id);
    const reply =
      last?.status === "CONFIRMED"
        ? `Pronto: ${last.result ?? "tarefas criadas"}. Já aparecem em **Tarefas** para cada responsável, com o prazo, e o aviso do painel foi atualizado. Nada foi enviado ao cliente.`
        : "Tudo bem, não criei nada. Se quiser, ajusto os responsáveis ou os prazos antes.";
    for (const piece of chunks(reply)) {
      yield { event: "token", data: { text: piece } };
      await wait(18);
    }
    conversation.messages.push({ role: "assistant", text: reply, steps: [] });
    yield { event: "done", data: { text: reply, totalTokens: 412 } };
    return;
  }

  const script = pick(conversation, text);
  const steps: ChatMessage["steps"] = [];
  for (const [index, tool] of script.tools.entries()) {
    const callId = `call-${index}`;
    yield { event: "tool_start", data: { callId, tool } };
    await wait(450);
    yield { event: "tool_call", data: { callId, tool } };
    steps.push({ kind: "tool", tool, action: null, reason: null, scope: null });
    audit("ai.tool.executed", "tool", tool, "AI_TOOL");
  }

  for (const piece of chunks(script.text)) {
    yield { event: "token", data: { text: piece } };
    await wait(14);
  }

  if (script.action) {
    const action: PendingAction = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      tool: script.action.tool,
      summary: script.action.summary,
      arguments: JSON.stringify(script.action.arguments),
      createdAt: new Date().toISOString(),
      status: "PENDING",
      result: null,
      apply: script.action.apply,
    };
    db.actions.push(action);
    yield {
      event: "action_pending",
      data: { callId: "call-action", actionId: action.id, tool: action.tool, summary: action.summary, arguments: action.arguments },
    };
    steps.push({ kind: "pending", tool: action.tool, action: pendingView(action), reason: null, scope: null });
  }

  if (script.navigate) {
    yield { event: "ui_action", data: { type: "navigate", ...script.navigate } };
  }

  conversation.messages.push({ role: "assistant", text: script.text, steps });
  yield { event: "done", data: { text: script.text, totalTokens: 1800 + script.text.length } };
}

export function pendingView(action: PendingAction) {
  return {
    id: action.id,
    conversationId: action.conversationId,
    tool: action.tool,
    summary: action.summary,
    arguments: action.arguments,
    createdAt: action.createdAt,
    expiresAt: new Date(new Date(action.createdAt).getTime() + 15 * 60_000).toISOString(),
    status: action.status,
    result: action.result,
  };
}
