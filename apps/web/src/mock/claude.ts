// The assistant's answers through the Claude API. No tools: every turn sends a snapshot of the demo
// data in the system prompt and streams Claude's reply in the portal's SSE frames. Enabled when
// ANTHROPIC_API_KEY is set (apps/web/.env.local); without it the scripted answers in ai.ts are used.
import Anthropic from "@anthropic-ai/sdk";
import { COMPANY, PRODUCT_NAME, OWNER_NAME } from "@/core/brand";
import { db } from "./db";
import {
  computeAvisos,
  computeHoras,
  computeResumo,
  FASE_LABEL,
  FRENTE_LABEL,
  JANELA_CONTINUIDADE,
  listEntregaveis,
  listProjetos,
  listReunioes,
  META_MARGEM,
  VALOR_HORA,
} from "./consultoria";
import { CUSTO_HORA, EQUIPE } from "@/modules/consultoria/team";
import { COMBINADO_LABEL, CONTINUIDADE_LABEL, ENTREGAVEL_LABEL } from "@/modules/consultoria/labels";
import type { Combinado, Projeto, Reuniao } from "@/modules/consultoria/types";
import type { StoredConversation } from "./db";
import type { Frame } from "./ai";

export const claudeEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

const client = claudeEnabled ? new Anthropic() : null;

const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

const AVISO: Record<string, string> = {
  SEM_RESPONSAVEL: "Combinado de reunião sem responsável",
  SEM_CONTINUIDADE: "Termina em até 15 dias sem proposta de continuidade",
  HORAS_ACIMA: "Horas 10% ou mais acima do orçado",
  ENTREGA_ATRASADA: "Entrega atrasada",
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const weekday = (iso: string) => `${DIAS[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()]}, ${day(iso)}`;

function combinadoTexto(c: Combinado) {
  const estado =
    c.status === "FEITO"
      ? `feito por ${c.responsavel}${c.feitoEm ? ` em ${day(c.feitoEm)}` : ""}: ${c.feito}`
      : c.status === "SEM_RESPONSAVEL"
        ? `ninguém ficou responsável (sugestão da IA: ${c.sugerido}, prazo ${day(c.prazoSugerido)})`
        : `com ${c.responsavel}, prazo ${c.prazo ? day(c.prazo) : "sem prazo"}${c.status === "ATRASADO" ? " (atrasado)" : ""}`;
  return `      - [${COMBINADO_LABEL[c.status]}] ${c.texto} · pedido por ${c.pedidoPor}${c.trecho ? ` · trecho da transcrição aos ${c.minuto} min: "${c.trecho}"` : ""}${c.impacto ? ` · por que importa: ${c.impacto}` : ""} · ${estado}`;
}

function reuniaoTexto(r: Reuniao) {
  return [
    `  - Reunião de ${weekday(r.data)}, ${r.hora}, ${r.duracaoMin} min, "${r.titulo}" · fonte: ${r.fonte} · participantes: ${r.participantes.map((p) => `${p.nome} (${p.lado === "CLIENTE" ? `cliente, ${p.papel}` : p.papel})`).join("; ")}`,
    `    Resumo: ${r.resumo}`,
    `    Combinados:`,
    ...r.combinados.map(combinadoTexto),
  ].join("\n");
}

function projetoTexto(p: Projeto, reunioes: Reuniao[]) {
  const mensal = p.cobranca === "MENSAL";
  const horas = mensal
    ? `${p.horasLancadas}h por mês em média nos últimos 3 meses, orçado ${p.horasOrcadas}h por mês`
    : `${p.horasLancadas}h lançadas de ${p.horasOrcadas}h orçadas, ${p.concluido}% concluído, projeção de ${p.horasProjetadas}h ao fim`;
  const c = p.continuidade;
  const entregaveis = listEntregaveis(db).filter((e) => e.projetoId === p.id);
  const linhas = [
    `- [${p.id}] ${p.nome} · cliente ${p.cliente} ("${p.apelido}"), ${p.segmento}, ${p.cidade} · contato ${p.contato} · frente ${FRENTE_LABEL[p.frente]} · gerente ${p.responsavel} · sócio ${p.socio} · equipe ${p.equipe.join(", ")} · ${mensal ? `contrato mensal de ${brl(p.valor)}` : `contrato de ${brl(p.valor)}, preço fechado`} · período ${day(p.inicio)} a ${day(p.fim)} · fase ${FASE_LABEL[p.fase]} (${p.faseDetalhe}) · ${horas} (${p.estouro >= 0 ? "+" : ""}${p.estouro}% sobre o orçado) · custo-hora médio da equipe ${brl(p.custoHora)} · margem orçada ${p.margemPlanejada}%, margem ${mensal ? "atual" : "projetada"} ${p.margemAtual}%${p.avisos.length ? ` · avisos: ${p.avisos.map((a) => AVISO[a]).join(", ")}` : ""}`,
    `  Continuidade: ${CONTINUIDADE_LABEL[c.status]}${c.texto ? ` · ${c.texto}` : ""}${c.valorMensal ? ` · ${brl(c.valorMensal)}/mês` : ""}${c.evento ? ` · ${c.evento.fonte}: ${c.evento.texto}` : ""}`,
    `  Entregáveis: ${entregaveis.map((e) => `${e.nome} (${ENTREGAVEL_LABEL[e.status]}, ${e.status === "ENTREGUE" || e.status === "APROVACAO_CLIENTE" ? "entregue em" : "prazo"} ${day(e.prazo)}, ${e.responsavel})`).join("; ")}`,
    `  Horas por pessoa: ${p.pessoas.map((x) => `${x.nome} (${x.nivel}, ${brl(x.custoHora)}/h) ${x.horas}h`).join("; ")}`,
  ];
  if (p.causas) linhas.push(`  Horas a mais por causa: ${p.causas.map((x) => `${x.texto}: ${x.horas}h (fonte: ${x.fonte})`).join("; ")}`);
  if (p.meses) linhas.push(`  Horas por mês: ${p.meses.map((m) => `${m.mes} ${m.horas}h`).join("; ")}`);
  linhas.push(`  Ação sugerida: ${p.acaoSugerida}`);
  linhas.push(`  Reuniões (mais recente primeiro):`);
  linhas.push(...reunioes.filter((r) => r.projetoId === p.id).map(reuniaoTexto));
  return linhas.join("\n");
}

function contexto() {
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const r = computeResumo(db);
  const avisos = computeAvisos(db);
  const reunioes = listReunioes(db);
  const semana = computeHoras(db).semana;

  const orfaos = avisos.combinados.grupos.flatMap((g) =>
    g.itens.map((c) => `- ${g.reuniao.apelido} · ${g.reuniao.fonte} · ${c.texto} · pedido por ${c.pedidoPor}${c.impacto ? ` · ${c.impacto}` : ""} · sugestão: ${c.sugerido} até ${day(c.prazoSugerido)}`),
  );
  const continuidade = avisos.continuidade.projetos.map(
    (a) => `- ${a.apelido} · ${a.projeto} · termina em ${day(a.fim)} (${a.dias} dias) · sócio ${a.socio} · continuidade sugerida: ${a.sugestao}, ${brl(a.valorMensal)}/mês (${brl(a.valorAno)}/ano)${a.evento ? ` · ${a.evento.fonte}: ${a.evento.texto}` : ""}`,
  );

  const tarefas = db.tasks
    .filter((t) => t.status === "OPEN")
    .map((t) => `- ${t.title}${t.assignee ? ` · com ${t.assignee.name}` : " · sem responsável"}${t.dueDate ? ` · prazo ${day(t.dueDate)}` : ""}`);

  const equipe = db.users
    .filter((u) => u.status === "ACTIVE")
    .map((u) => {
      const p = EQUIPE.find((e) => e.nome === u.name);
      return `- ${u.name}${p ? ` (${p.cargo}, custo de ${brl(CUSTO_HORA[p.nivel])} por hora)` : ` (${u.roles.map((role) => role.name).join(", ")})`}`;
    });

  return `Você é o assistente do ${PRODUCT_NAME}, o sistema interno da ${COMPANY.fullName}, ${COMPANY.about}. Quem fala com você é ${OWNER_NAME}, ${COMPANY.owner.role.toLowerCase()}.

Hoje é ${hoje}.

Seu trabalho é mostrar, antes de alguém perguntar, o que foi combinado com cada cliente e ficou sem dono, lendo as transcrições das reuniões (Meet e Zoom) e cruzando com as tarefas do time; os projetos que terminam sem proposta de continuidade (renovação é receita); e as horas lançadas contra o orçado de cada projeto, sempre com a fonte e ligando ao dinheiro.

Responda em português do Brasil, como um sócio de consultoria experiente falaria com quem divide a sociedade com ele: responda exatamente o que foi perguntado, direto, com no máximo uma tabela curta e poucas frases. Ao falar de um pedido do cliente, cite a reunião com o dia da semana, a data e a fonte (por exemplo "Reunião de terça, 06/10 · transcrição do Meet") e diga com quem está, ou que ninguém ficou responsável. Use só os dados abaixo: se a resposta não estiver neles, diga que o sistema não tem essa informação. Nunca invente cliente, pessoa, número ou data. Não use travessão. Você não cria tarefas nem envia nada ao cliente por conta própria: quando fizer sentido, termine perguntando se ele quer que você crie as tarefas (ele confirma num cartão de aprovação).

Como os números são calculados: projeção de horas de um projeto de preço fechado = horas lançadas ÷ % concluído. Margem = (valor do contrato - horas × custo-hora) ÷ valor do contrato; meta da consultoria: ${META_MARGEM}%. Nos contratos mensais, as horas são a média dos últimos 3 meses. Um projeto entra no aviso de continuidade quando termina em até ${JANELA_CONTINUIDADE} dias sem proposta. Valor-hora de tabela nas propostas: ${brl(VALOR_HORA)}.

## Resumo
- ${r.emAndamento} projetos em andamento, ${brl(r.valorEmCarteira)} em contrato (o mensal contado por 12 meses)
- ${r.semResponsavel} combinados de reunião sem responsável, em ${r.reunioesComPendencia} reuniões
- ${r.semContinuidade} projetos terminam em até ${JANELA_CONTINUIDADE} dias sem proposta; ${brl(r.renovacaoAno)} por ano de renovação em jogo
- ${r.horasAcima}h projetadas acima do orçado; ${r.acimaDoOrcado} projetos 10% ou mais acima; margem média ${r.margemMedia}% (orçada ${r.margemPlanejadaMedia}%)
- Entregáveis: ${r.atrasadas} atrasados, ${r.proximas15} vencem em 15 dias, ${r.aguardandoCliente} com o cliente para aprovar, ${r.entregues30} entregues em 30 dias
- Semana passada (${day(semana.inicio)} a ${day(semana.fim)}): ${r.pessoasSemLancar} pessoas lançaram menos de 32h, ${r.horasSemLancar}h faltando. Por pessoa: ${semana.pessoas.map((p) => `${p.nome} ${p.lancadas}h`).join(", ")}

## Avisos da IA de hoje
Combinados sem responsável:
${orfaos.join("\n") || "- nenhum"}
Projetos terminando sem continuidade:
${continuidade.join("\n") || "- nenhum"}

## Projetos, com reuniões e combinados (${db.projetos.length})
${listProjetos(db).map((p) => projetoTexto(p, reunioes)).join("\n")}

## Equipe
${equipe.join("\n")}

## Tarefas abertas da equipe
${tarefas.join("\n")}`;
}

export async function* claudeTurn(conversation: StoredConversation, model: string | null): AsyncGenerator<Frame> {
  if (!client) return;
  yield { event: "thinking", data: {} };
  yield { event: "tool_start", data: { callId: "call-0", tool: "consultoria_reunioes" } };

  const messages: Anthropic.Beta.BetaMessageParam[] = conversation.messages
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

  let text = "";
  try {
    const stream = client.beta.messages.stream({
      model: model && MODELS.has(model) ? model : "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: contexto(),
      messages,
    });
    let started = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (!started) {
          started = true;
          yield { event: "tool_call", data: { callId: "call-0", tool: "consultoria_reunioes" } };
        }
        text += event.delta.text;
        yield { event: "token", data: { text: event.delta.text } };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" && !text) {
      yield { event: "error", data: { message: "O modelo recusou esta pergunta. Tente reformular." } };
      return;
    }
    conversation.messages.push({ role: "assistant", text, steps: [{ kind: "tool", tool: "consultoria_reunioes", action: null, reason: null, scope: null }] });
    yield { event: "done", data: { text, totalTokens: final.usage.input_tokens + final.usage.output_tokens } };
  } catch (error) {
    const message =
      error instanceof Anthropic.AuthenticationError
        ? "A chave da API da Anthropic foi recusada. Confira ANTHROPIC_API_KEY em apps/web/.env.local."
        : error instanceof Anthropic.RateLimitError
          ? "Limite de uso da API atingido. Aguarde um pouco e tente de novo."
          : error instanceof Anthropic.APIError
            ? `A API da Anthropic respondeu com erro ${error.status}.`
            : "Não foi possível falar com a API da Anthropic.";
    console.error("[assistente]", error);
    yield { event: "error", data: { message } };
  }
}
