// Demonstration API of the company screens (/api/empresa/*). Generic: the company's own data lives
// in ./empresa.ts. Every answer is computed per request from those constants, so a hot reload shows
// new data at once; what the person changes during the video (a deal moved, an automation switched
// off, a tool connected) is kept in a small overlay on globalThis.
import { NextResponse } from "next/server";
import type {
  AutomacoesView,
  ComercialView,
  Execucao,
  FinanceiroView,
  IntegracoesView,
  Lancamento,
  Negocio,
  StatusIntegracao,
} from "@/modules/empresa/types";
import {
  AUTOMACOES,
  COMERCIAL,
  EXECUCOES,
  FERRAMENTAS,
  FINANCEIRO,
  IAS,
  MODELOS,
  type RawLancamento,
} from "./empresa";

/** Permissions of the company screens; the administrator gets them all (see db.ts). */
export const EMPRESA_PERMISSIONS: [module: string, key: string, description: string][] = [
  ["empresa", "empresa.comercial.read", "Ver o funil comercial"],
  ["empresa", "empresa.comercial.update", "Mover negócios no funil"],
  ["empresa", "empresa.financeiro.read", "Ver o financeiro da empresa"],
  ["empresa", "empresa.automacao.read", "Ver as automações"],
  ["empresa", "empresa.automacao.update", "Ligar e desligar automações"],
  ["empresa", "empresa.integracao.read", "Ver as integrações"],
  ["empresa", "empresa.integracao.update", "Conectar ferramentas e IAs"],
];

const MIN = 60_000;
const DAY = 86_400_000;

const minutesAgo = (min: number) => new Date(Date.now() - min * MIN).toISOString();

/** Local `YYYY-MM-DD` of a day relative to today. */
function dayFrom(offset: number) {
  const d = new Date(Date.now() + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A moment `days` ago at a working hour, stable for the day. */
function workTime(days: number, hour: number) {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, (days * 17 + hour * 7) % 60, 0, 0);
  if (d.getTime() > Date.now()) d.setTime(Date.now() - 40 * MIN);
  return d.toISOString();
}

interface Overlay {
  etapas: Record<string, { etapa: string; movedAt: number }>;
  automacoes: Record<string, boolean>;
  integracoes: Record<string, StatusIntegracao>;
}

const holder = globalThis as unknown as { __empresaOverlay?: Overlay };
const overlay: Overlay = (holder.__empresaOverlay ??= { etapas: {}, automacoes: {}, integracoes: {} });

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const notFound = (what: string) =>
  NextResponse.json(
    { status: 404, title: "Não encontrado", detail: `${what} não encontrado.` },
    { status: 404, headers: { "Content-Type": "application/problem+json" } },
  );

// ---- Comercial ------------------------------------------------------------------------------------

function negocios(): Negocio[] {
  return COMERCIAL.negocios.map((n) => {
    const moved = overlay.etapas[n.id];
    const atividades = n.atividades
      .map(([tipo, dias, texto, fonte], index) => ({ tipo, quando: workTime(dias, 9 + ((index * 3 + dias) % 8)), texto, fonte }))
      .sort((a, b) => b.quando.localeCompare(a.quando));
    if (moved) {
      const etapa = COMERCIAL.etapas.find((e) => e.key === moved.etapa)?.label ?? moved.etapa;
      atividades.unshift({ tipo: "NOTA", quando: new Date(moved.movedAt).toISOString(), texto: `Movido para ${etapa}`, fonte: "Funil comercial" });
    }
    return {
      id: n.id,
      empresa: n.empresa,
      contato: n.contato,
      segmento: n.segmento,
      servico: n.servico,
      valor: n.valor,
      recorrente: n.recorrente,
      etapa: moved?.etapa ?? n.etapa,
      responsavel: n.responsavel,
      origem: n.origem,
      diasNaEtapa: moved ? Math.floor((Date.now() - moved.movedAt) / DAY) : n.diasNaEtapa,
      proximoPasso: n.proximoPasso,
      probabilidade: moved?.etapa === COMERCIAL.etapaGanha ? 100 : n.probabilidade,
      atividades,
    };
  });
}

const mensal = (n: Negocio) => n.valor;

function comercial(): ComercialView {
  const list = negocios();
  const abertos = list.filter((n) => n.etapa !== COMERCIAL.etapaGanha);
  const propostas = abertos.filter((n) => COMERCIAL.etapasProposta.includes(n.etapa));
  const ganhos = list.filter((n) => n.etapa === COMERCIAL.etapaGanha);
  const ticketBase = [...ganhos.map(mensal), ...COMERCIAL.ganhosAnteriores];
  return {
    titulo: COMERCIAL.titulo,
    descricao: COMERCIAL.descricao,
    etapas: COMERCIAL.etapas,
    etapaGanha: COMERCIAL.etapaGanha,
    diasParado: COMERCIAL.diasParado,
    negocios: list,
    responsaveis: [...new Set(COMERCIAL.negocios.map((n) => n.responsavel))],
    stats: {
      pipelineTotal: abertos.reduce((s, n) => s + mensal(n), 0),
      abertos: abertos.length,
      propostasAbertas: propostas.length,
      propostasValor: propostas.reduce((s, n) => s + mensal(n), 0),
      conversao90: COMERCIAL.conversao90,
      conversao90Antes: COMERCIAL.conversao90Antes,
      ticketMedio: Math.round(ticketBase.reduce((s, v) => s + v, 0) / ticketBase.length / 100) * 100,
      ganhos90: COMERCIAL.ganhosAnteriores.length + ganhos.length,
    },
  };
}

// ---- Financeiro -----------------------------------------------------------------------------------

function lancamentos(raw: RawLancamento[], prefix: string): Lancamento[] {
  return raw
    .map(([nome, categoria, descricao, vence, valor, pago], index) => ({
      id: `${prefix}-${index + 1}`,
      nome,
      categoria,
      descricao,
      vencimento: dayFrom(vence),
      valor,
      status: pago ? ("PAGO" as const) : vence < 0 ? ("VENCIDO" as const) : ("A_VENCER" as const),
    }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

function financeiro(): FinanceiroView {
  const pagar = lancamentos(FINANCEIRO.pagar, "pg");
  const receber = lancamentos(FINANCEIRO.receber, "rc");
  const limite = dayFrom(30);
  const abertos = (list: Lancamento[]) => list.filter((l) => l.status !== "PAGO" && l.vencimento <= limite);
  const contas = FINANCEIRO.contas.map((c) => ({ ...c, sincronizadoEm: minutesAgo(c.sincronizadoMin) }));
  const saldo = contas.reduce((s, c) => s + c.saldo, 0);
  const despesaMes = FINANCEIRO.categorias.reduce((s, c) => s + c.valor, 0);
  let corrente = saldo;
  const fluxo = FINANCEIRO.fluxoEntradas.map((entradas, i) => {
    const saidas = FINANCEIRO.fluxoSaidas[i];
    corrente += entradas - saidas;
    const inicio = new Date(`${dayFrom(i * 7)}T12:00:00`);
    return {
      semana: inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      entradas,
      saidas,
      saldo: corrente,
    };
  });
  return {
    resumo: {
      saldo,
      aReceber30: abertos(receber).reduce((s, l) => s + l.valor, 0),
      aReceber30Qtd: abertos(receber).length,
      aPagar30: abertos(pagar).reduce((s, l) => s + l.valor, 0),
      aPagar30Qtd: abertos(pagar).length,
      resultadoMes: FINANCEIRO.receitaMes - despesaMes,
      receitaMes: FINANCEIRO.receitaMes,
      despesaMes,
      margemMes: Math.round(((FINANCEIRO.receitaMes - despesaMes) / FINANCEIRO.receitaMes) * 1000) / 10,
      vencidosReceber: receber.filter((l) => l.status === "VENCIDO").reduce((s, l) => s + l.valor, 0),
    },
    contas,
    fluxo,
    pagar,
    receber,
    categorias: [...FINANCEIRO.categorias].sort((a, b) => b.valor - a.valor),
  };
}

// ---- Automações -----------------------------------------------------------------------------------

function automacoes(): AutomacoesView {
  const list = AUTOMACOES.map(({ ultimaMin, ...a }) => ({
    ...a,
    ativa: overlay.automacoes[a.id] ?? a.ativa,
    ultimaExecucao: minutesAgo(ultimaMin),
  }));
  const execucoes: Execucao[] = EXECUCOES.map(([automacaoId, min, resultado, duracaoSeg, detalhe], index) => ({
    id: `ex-${index + 1}`,
    automacaoId,
    automacao: AUTOMACOES.find((a) => a.id === automacaoId)?.nome ?? automacaoId,
    quando: minutesAgo(min),
    resultado,
    duracaoSeg,
    detalhe,
  }));
  const ativas = list.filter((a) => a.ativa);
  const execucoesMes = list.reduce((s, a) => s + a.execucoesMes, 0);
  const sucesso = list.reduce((s, a) => s + a.sucesso * a.execucoesMes, 0) / Math.max(execucoesMes, 1);
  return {
    automacoes: list,
    execucoes,
    modelos: MODELOS,
    stats: {
      ativas: ativas.length,
      total: list.length,
      execucoesMes,
      horasMes: ativas.reduce((s, a) => s + a.horasMes, 0),
      sucesso: Math.round(sucesso * 10) / 10,
    },
  };
}

// ---- Integrações ----------------------------------------------------------------------------------

function integracoes(): IntegracoesView {
  const ferramentas = FERRAMENTAS.map(({ sincronizadoMin, ...f }) => {
    const status = overlay.integracoes[f.id] ?? f.status;
    const conectouAgora = status === "CONECTADO" && f.status !== "CONECTADO";
    return {
      ...f,
      status,
      sincronizadoEm: conectouAgora ? minutesAgo(0) : sincronizadoMin === null ? null : minutesAgo(sincronizadoMin),
      uso: conectouAgora ? "Primeira sincronização em andamento" : f.uso,
    };
  });
  const ias = IAS.map((ia) => ({ ...ia, status: overlay.integracoes[ia.id] ?? ia.status }));
  const all = [...ferramentas, ...ias];
  return {
    ferramentas,
    ias,
    stats: {
      conectadas: all.filter((i) => i.status !== "DISPONIVEL").length,
      total: all.length,
      registrosMes: FINANCEIRO.registrosSincronizadosMes,
      reautenticar: all.filter((i) => i.status === "REAUTENTICAR").length,
    },
  };
}

// ---- routes ---------------------------------------------------------------------------------------

/** Answers /api/empresa/*; null when the path is not one of these screens. */
export function handleEmpresa(path: string[], method: string, body: Record<string, unknown> | null): NextResponse | null {
  if (path[0] !== "empresa") return null;
  const [, area, kind, id] = path;

  if (area === "comercial" && !kind) return json(comercial());
  if (area === "comercial" && kind === "negocios" && id) {
    const raw = COMERCIAL.negocios.find((n) => n.id === id);
    if (!raw) return notFound("Negócio");
    const etapa = typeof body?.etapa === "string" ? body.etapa : null;
    if (method === "PATCH" && etapa && COMERCIAL.etapas.some((e) => e.key === etapa)) {
      if (etapa === raw.etapa) delete overlay.etapas[id];
      else overlay.etapas[id] = { etapa, movedAt: Date.now() };
    }
    return json(negocios().find((n) => n.id === id));
  }

  if (area === "financeiro") return json(financeiro());

  if (area === "automacoes" && !kind) return json(automacoes());
  if (area === "automacoes" && kind) {
    const raw = AUTOMACOES.find((a) => a.id === kind);
    if (!raw) return notFound("Automação");
    if (method === "PATCH" && typeof body?.ativa === "boolean") overlay.automacoes[kind] = body.ativa;
    return json(automacoes().automacoes.find((a) => a.id === kind));
  }

  if (area === "integracoes" && !kind) return json(integracoes());
  if (area === "integracoes" && kind) {
    const known = FERRAMENTAS.some((f) => f.id === kind) || IAS.some((i) => i.id === kind);
    if (!known) return notFound("Integração");
    if (method === "POST" || method === "PATCH") overlay.integracoes[kind] = "CONECTADO";
    const view = integracoes();
    return json([...view.ferramentas, ...view.ias].find((i) => i.id === kind));
  }

  return notFound("Recurso");
}
