// Shapes of the company screens (Comercial, Financeiro, Automações, Integrações). The screens are
// generic: everything specific to the company's market comes from src/mock/empresa.ts.

// ---- Comercial ------------------------------------------------------------------------------------

/** Where the deal came from; "Cliente atual" is a renewal or a new phase of a running client. */
export type Origem = "Indicação" | "LinkedIn" | "Site" | "Evento" | "Cliente atual";

export type TipoAtividade = "REUNIAO" | "EMAIL" | "PROPOSTA" | "LIGACAO" | "WHATSAPP" | "NOTA";

export interface Atividade {
  tipo: TipoAtividade;
  /** ISO date-time. */
  quando: string;
  texto: string;
  /** Where the record came from: "Google Agenda", "Gmail", "WhatsApp"... */
  fonte: string;
}

export interface EtapaPipeline {
  key: string;
  label: string;
}

export interface Negocio {
  id: string;
  empresa: string;
  contato: string;
  segmento: string;
  /** What is being sold: "Conteúdo + mídia paga", "Assessoria em 6 processos/mês". */
  servico: string;
  valor: number;
  /** True for a monthly fee (R$/mês), false for a one-off total. */
  recorrente: boolean;
  etapa: string;
  responsavel: string;
  origem: Origem;
  diasNaEtapa: number;
  proximoPasso: string;
  probabilidade: number;
  atividades: Atividade[];
}

export interface ComercialView {
  titulo: string;
  descricao: string;
  etapas: EtapaPipeline[];
  /** Key of the won stage (last column). */
  etapaGanha: string;
  /** Days without a move that make a deal "parado". */
  diasParado: number;
  negocios: Negocio[];
  responsaveis: string[];
  stats: {
    pipelineTotal: number;
    abertos: number;
    propostasAbertas: number;
    propostasValor: number;
    conversao90: number;
    conversao90Antes: number;
    ticketMedio: number;
    ganhos90: number;
  };
}

// ---- Financeiro -----------------------------------------------------------------------------------

export type StatusLancamento = "PAGO" | "A_VENCER" | "VENCIDO";

export interface ContaBancaria {
  id: string;
  banco: string;
  tipo: string;
  sigla: string;
  cor: CorMarca;
  saldo: number;
  /** ISO date-time of the last sync with the bank. */
  sincronizadoEm: string;
  /** Change in the last 30 days, in R$. */
  variacao30: number;
}

export interface Lancamento {
  id: string;
  /** Supplier (a pagar) or client (a receber). */
  nome: string;
  categoria: string;
  descricao: string;
  vencimento: string;
  valor: number;
  status: StatusLancamento;
}

export interface FluxoSemana {
  semana: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface FinanceiroView {
  resumo: {
    saldo: number;
    aReceber30: number;
    aReceber30Qtd: number;
    aPagar30: number;
    aPagar30Qtd: number;
    resultadoMes: number;
    receitaMes: number;
    despesaMes: number;
    margemMes: number;
    vencidosReceber: number;
  };
  contas: ContaBancaria[];
  fluxo: FluxoSemana[];
  pagar: Lancamento[];
  receber: Lancamento[];
  categorias: { categoria: string; valor: number }[];
}

// ---- Automações -----------------------------------------------------------------------------------

/** Key of an icon of the flow chips; the screen maps it to a lucide icon (see empresa/ui.tsx). */
export type IconeKey =
  | "relogio"
  | "calendario"
  | "erp"
  | "email"
  | "whatsapp"
  | "crm"
  | "ia"
  | "documento"
  | "alerta"
  | "navio"
  | "planilha"
  | "relatorio"
  | "usuarios"
  | "check"
  | "pasta"
  | "dinheiro"
  | "anuncio"
  | "sincronizar"
  | "termometro"
  | "chat";

export interface PassoAutomacao {
  icone: IconeKey;
  texto: string;
  /** The tool that does the step, shown below the text: "Gmail", "Conexos". */
  ferramenta?: string;
}

export type SaudeAutomacao = "OK" | "ATENCAO" | "ERRO";

export interface Automacao {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  /** First step is the trigger, the others are actions. */
  passos: PassoAutomacao[];
  ativa: boolean;
  ultimaExecucao: string;
  execucoesMes: number;
  sucesso: number;
  horasMes: number;
  saude: SaudeAutomacao;
  /** Short note under the card when saude is not OK. */
  aviso?: string;
}

export type ResultadoExecucao = "SUCESSO" | "FALHOU" | "APROVACAO";

export interface Execucao {
  id: string;
  automacaoId: string;
  automacao: string;
  quando: string;
  resultado: ResultadoExecucao;
  duracaoSeg: number;
  detalhe: string;
}

export interface ModeloAutomacao {
  nome: string;
  descricao: string;
  passos: PassoAutomacao[];
}

export interface AutomacoesView {
  automacoes: Automacao[];
  execucoes: Execucao[];
  modelos: ModeloAutomacao[];
  stats: { ativas: number; total: number; execucoesMes: number; horasMes: number; sucesso: number };
}

// ---- Integrações ----------------------------------------------------------------------------------

/** Colour of a tool's badge: a fixed palette mapped to classes in empresa/ui.tsx. */
export type CorMarca =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "green"
  | "emerald"
  | "teal"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "slate"
  | "black"
  | "stone";

export type StatusIntegracao = "CONECTADO" | "REAUTENTICAR" | "DISPONIVEL";

export interface Ferramenta {
  id: string;
  nome: string;
  categoria: string;
  sigla: string;
  cor: CorMarca;
  status: StatusIntegracao;
  /** Marks the company's main system ("ERP principal"). */
  destaque?: string;
  sincronizadoEm: string | null;
  /** What the integration did this month: "1.240 e-mails lidos este mês". */
  uso: string;
  /** What it brings in: ["E-mails", "Agenda", "Drive"]. */
  sincroniza: string[];
}

export interface IaConectada {
  id: string;
  nome: string;
  fornecedor: string;
  sigla: string;
  cor: CorMarca;
  status: StatusIntegracao;
  principal: boolean;
  modelo: string;
  conversasMes: number;
  horasMes: number;
  tokensMes: number;
  usuarios: string[];
  usadoPara: string;
}

export interface IntegracoesView {
  ferramentas: Ferramenta[];
  ias: IaConectada[];
  stats: { conectadas: number; total: number; registrosMes: number; reautenticar: number };
}
