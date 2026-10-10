// Shapes of the consultancy module (projetos, horas, reuniões e entregáveis of any consultoria:
// gestão, compliance, meio ambiente, estratégia). In this demo they are served by the mock API in
// src/mock; the real module would generate them from the API like the tasks module does.

/** Practice the project belongs to. */
export type Frente = "GESTAO" | "COMPLIANCE" | "AMBIENTAL" | "ESTRATEGIA" | "PESSOAS";

/** FIXO: one fee for the whole project; MENSAL: a monthly retainer, hours counted per month. */
export type Cobranca = "FIXO" | "MENSAL";

/** Generic phases, the same for every practice; the project says what the phase means for it. */
export type Fase = "DIAGNOSTICO" | "DESENHO" | "IMPLANTACAO" | "ENCERRAMENTO" | "ACOMPANHAMENTO";

export type Nivel = "Sócio" | "Gerente" | "Sênior" | "Consultor" | "Analista";

/** Where the meeting transcript came from. */
export type FonteReuniao = "MEET" | "ZOOM";

/**
 * What became of something agreed in a meeting: done, with someone (on time or late), or with
 * nobody at all, the case the assistant raises.
 */
export type StatusCombinado = "FEITO" | "EM_ANDAMENTO" | "ATRASADO" | "SEM_RESPONSAVEL";

export type StatusEntregavel = "ENTREGUE" | "APROVACAO_CLIENTE" | "EM_ANDAMENTO" | "ATRASADO" | "NAO_INICIADO";

/** What happens after the project ends: the renewal, which is revenue. */
export type Continuidade = "SEM_PROPOSTA" | "EM_CONVERSA" | "PROPOSTA_ENVIADA" | "RECORRENTE" | "NAO_SE_APLICA";

export type TipoAviso = "SEM_RESPONSAVEL" | "SEM_CONTINUIDADE" | "HORAS_ACIMA" | "ENTREGA_ATRASADA";

/** Something the system read about a project, with where it came from. */
export interface Evento {
  tipo: "REUNIAO" | "EMAIL" | "HORAS" | "PROPOSTA";
  /** As people read it: "Reunião de quarta, 07/10 · transcrição do Zoom", "E-mail de 29/09". */
  fonte: string;
  texto: string;
  /** Day it happened (ISO date). */
  data: string;
}

/** Hours of one person of the team on the project, at their cost per hour. */
export interface HorasPessoa {
  nome: string;
  nivel: Nivel;
  custoHora: number;
  horas: number;
}

/** Where the extra hours went, with the source that explains each part. */
export interface Causa {
  texto: string;
  horas: number;
  fonte: string;
}

export interface Participante {
  nome: string;
  /** Role at the client ("diretor de operações") or the team member's cargo. */
  papel: string;
  lado: "CLIENTE" | "EQUIPE";
}

/** Something agreed in a meeting or asked by the client, and what became of it. */
export interface Combinado {
  id: string;
  reuniaoId: string;
  projetoId: string;
  apelido: string;
  texto: string;
  /** Who asked for it: "Sérgio Bittencourt" (client) or a team member. */
  pedidoPor: string;
  /** Words of the transcript, when the client asked for it. */
  trecho: string | null;
  /** Minute of the meeting where it was said. */
  minuto: number | null;
  /** Why it matters beyond the item itself: "É o que a Renata leva ao comitê para aprovar a fase 2". */
  impacto: string | null;
  status: StatusCombinado;
  responsavel: string | null;
  tarefaId: string | null;
  /** Due date of the task (ISO date), when there is one. */
  prazo: string | null;
  /** What was done, for FEITO: "Versão 3 enviada por e-mail e aprovada pela Renata". */
  feito: string | null;
  feitoEm: string | null;
  /** Owner the assistant suggests when nobody took it: the person of the project who fits. */
  sugerido: string;
  /** Due date the assistant suggests for the task (ISO date). */
  prazoSugerido: string;
  /** The meeting as people cite it: "Reunião de terça, 06/10 · transcrição do Meet". */
  fonte: string;
}

export interface Reuniao {
  id: string;
  projetoId: string;
  projeto: string;
  clienteId: string;
  cliente: string;
  apelido: string;
  frente: Frente;
  titulo: string;
  /** ISO date. */
  data: string;
  hora: string;
  duracaoMin: number;
  origem: FonteReuniao;
  /** "Reunião de terça, 06/10 · transcrição do Meet". */
  fonte: string;
  participantes: Participante[];
  /** Summary written from the transcript. */
  resumo: string;
  combinados: Combinado[];
  feitos: number;
  semResponsavel: number;
}

export interface Entregavel {
  id: string;
  projetoId: string;
  projeto: string;
  apelido: string;
  cliente: string;
  frente: Frente;
  nome: string;
  responsavel: string;
  /** ISO date: due date, or the day it was delivered. */
  prazo: string;
  status: StatusEntregavel;
  /** Where the file lives: "Drive · Ponte Alta / 04 Entregáveis". */
  pasta: string;
}

export interface ContinuidadeInfo {
  status: Continuidade;
  /** What the next contract would be: "Acompanhamento trimestral da execução do plano". */
  texto: string | null;
  /** Suggested or proposed monthly value, BRL. */
  valorMensal: number | null;
  /** What shows the client wants it (or what was sent), with the source. */
  evento: Evento | null;
}

/** A project of the consultancy: one client, one practice, one contract. */
export interface Projeto {
  id: string;
  /** "Redesenho dos processos de compras e estoque". */
  nome: string;
  frente: Frente;
  cobranca: Cobranca;
  clienteId: string;
  cliente: string;
  /** How the team calls the client: "Ponte Alta". */
  apelido: string;
  segmento: string;
  cidade: string;
  /** Main contact at the client, with the role. */
  contato: string;
  /** Project manager. */
  responsavel: string;
  socio: string;
  equipe: string[];
  /** Contract value (FIXO) or monthly retainer (MENSAL), BRL. */
  valor: number;
  /** Hours budgeted: for the whole project (FIXO) or per month (MENSAL). */
  horasOrcadas: number;
  /** Hours logged so far (FIXO) or the monthly average of the last 3 months (MENSAL). */
  horasLancadas: number;
  /** Percent of the work done (FIXO); null for retainers. */
  concluido: number | null;
  /** Hours at completion: logged ÷ done (FIXO); the monthly average (MENSAL). */
  horasProjetadas: number;
  /** Projected hours above budget, percent (negative when below). */
  estouro: number;
  /** Projected hours above budget (0 when inside it). */
  horasAcima: number;
  /** Average cost per hour of the team on this project, weighted by hours. */
  custoHora: number;
  margemPlanejada: number;
  margemAtual: number;
  fase: Fase;
  /** What the phase means for this project: "Protocolo da licença de instalação". */
  faseDetalhe: string;
  inicio: string;
  fim: string;
  entregas: { total: number; entregues: number; atrasadas: number; proxima: { nome: string; prazo: string } | null };
  continuidade: ContinuidadeInfo;
  pessoas: HorasPessoa[];
  causas: Causa[] | null;
  /** Hours per month, last 6 months, oldest first (retainers). */
  meses: { mes: string; horas: number }[] | null;
  reunioes: number;
  ultimaReuniao: string | null;
  combinadosSemResponsavel: number;
  combinadosAbertos: number;
  avisos: TipoAviso[];
  acaoSugerida: string;
}

/** A project ending soon without a proposal for what comes next. */
export interface AvisoContinuidade {
  projetoId: string;
  projeto: string;
  cliente: string;
  apelido: string;
  socio: string;
  responsavel: string;
  fim: string;
  dias: number;
  valor: number;
  sugestao: string;
  valorMensal: number;
  valorAno: number;
  evento: Evento | null;
  cruzou: string;
}

/** The hero of the dashboard: what the assistant raised on its own. */
export interface Avisos {
  combinados: {
    total: number;
    reunioes: number;
    clientes: string[];
    /** Orphan items grouped by meeting, the meeting with the most items first. */
    grupos: { reuniao: Omit<Reuniao, "combinados">; itens: Combinado[] }[];
    cruzou: string;
  };
  continuidade: {
    janelaDias: number;
    valorAno: number;
    projetos: AvisoContinuidade[];
  };
}

export interface ConsultoriaResumo {
  emAndamento: number;
  porFrente: Record<Frente, number>;
  valorEmCarteira: number;
  semResponsavel: number;
  reunioesComPendencia: number;
  clientesComPendencia: number;
  combinados30: number;
  reunioes30: number;
  feitos30: number;
  /** Projected hours above budget, all fixed-fee projects. */
  horasAcima: number;
  /** Projects that will end 10% or more above the budgeted hours. */
  acimaDoOrcado: number;
  margemMedia: number;
  margemPlanejadaMedia: number;
  metaMargem: number;
  horasLancadas: number;
  horasOrcadas: number;
  terminam15: number;
  semContinuidade: number;
  renovacaoAno: number;
  terminam30: number;
  entregues30: number;
  proximas15: number;
  atrasadas: number;
  aguardandoCliente: number;
  pessoasSemLancar: number;
  horasSemLancar: number;
}

export interface HorasProjeto {
  projetoId: string;
  projeto: string;
  cliente: string;
  apelido: string;
  frente: Frente;
  cobranca: Cobranca;
  responsavel: string;
  horasOrcadas: number;
  horasLancadas: number;
  horasProjetadas: number;
  concluido: number | null;
  /** Hours consumed, percent of the budget. */
  consumido: number;
  estouro: number;
  horasAcima: number;
  margemAtual: number;
  margemPlanejada: number;
  /** The main reason of the extra hours, with the source. */
  causa: Causa | null;
}

/** Hours of one person last week against the expected 40h. */
export interface HorasSemana {
  nome: string;
  cargo: string;
  nivel: Nivel;
  lancadas: number;
  esperadas: number;
  /** Where most of the week went. */
  projetos: { apelido: string; horas: number }[];
}

export interface HorasView {
  projetos: HorasProjeto[];
  semana: { inicio: string; fim: string; pessoas: HorasSemana[] };
}

export interface Cliente {
  id: string;
  nome: string;
  apelido: string;
  segmento: string;
  cidade: string;
  contato: string;
}
