// Demonstration data of the consultancy module. Every company, person and number here is fictional;
// dates are relative to the day the server starts, so the demo always looks current. Meetings fall
// on a fixed weekday ("a reunião de terça"), counted back from today, so they never land on a
// weekend and the sentence the assistant says stays true whatever day the video is recorded.
import type { TaskSummary } from "@/modules/tasks/types";
import { FASE_LABEL, FRENTE_LABEL } from "@/modules/consultoria/labels";
import { CUSTO_HORA, EQUIPE } from "@/modules/consultoria/team";
import type {
  Avisos,
  AvisoContinuidade,
  Causa,
  Cliente,
  Combinado,
  ConsultoriaResumo,
  Continuidade,
  Entregavel,
  Evento,
  Fase,
  FonteReuniao,
  Frente,
  HorasPessoa,
  HorasProjeto,
  HorasSemana,
  HorasView,
  Nivel,
  Projeto,
  Reuniao,
  StatusEntregavel,
  TipoAviso,
} from "@/modules/consultoria/types";

const DAY = 86_400_000;

/** Local `YYYY-MM-DD` of a day relative to today (local, so a late recording does not move it). */
export const isoDay = (offset: number) => {
  const d = new Date(Date.now() + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/**
 * A working day: a future date on a weekend moves to the Monday after, a past one to the Friday
 * before, so no due date of the demo falls on a Saturday or a Sunday.
 */
export const diaUtil = (offset: number) => {
  const weekday = new Date(Date.now() + offset * DAY).getDay();
  if (offset > 0 && (weekday === 0 || weekday === 6)) return isoDay(offset + (weekday === 6 ? 2 : 1));
  if (offset < 0 && (weekday === 0 || weekday === 6)) return isoDay(offset - (weekday === 6 ? 1 : 2));
  return isoDay(offset);
};
export const isoTime = (offsetDays: number, hour = 10) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, (offsetDays * 37) % 60 < 0 ? 0 : (offsetDays * 37) % 60, 0, 0);
  return d.toISOString();
};

/** dd/MM of an ISO date, as the team writes it ("06/10"). */
export const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "terça, 06/10". */
export const diaDaSemana = (iso: string) => `${DIAS[new Date(`${iso}T12:00:00`).getDay()]}, ${shortDay(iso)}`;

/**
 * Days back to the last `weekday` (1 = Monday ... 5 = Friday) strictly before today, `semanas` weeks
 * earlier: ultimo(2, 0) is the last Tuesday, ultimo(2, 1) the Tuesday before it.
 */
export function ultimo(weekday: number, semanas: number) {
  const today = new Date().getDay();
  const diff = (today - weekday + 7) % 7 || 7;
  return -(diff + 7 * semanas);
}

/** Margin the consultancy aims for on every project, percent. */
export const META_MARGEM = 35;

/** Price of one hour in the proposals (the base of continuity proposals). */
export const VALOR_HORA = 290;

/** A project ending within these days without a continuity proposal is raised. */
export const JANELA_CONTINUIDADE = 15;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const ORIGEM_LABEL: Record<FonteReuniao, string> = { MEET: "Meet", ZOOM: "Zoom" };

/** "Reunião de terça, 06/10 · transcrição do Meet". */
export const fonteReuniao = (data: string, origem: FonteReuniao) =>
  `Reunião de ${diaDaSemana(data)} · transcrição do ${ORIGEM_LABEL[origem]}`;

// ---- raw seed ---------------------------------------------------------------------------------------

/** [weekday (1 = Monday), weeks back] */
type Dia = [weekday: number, semanas: number];

interface RawCombinado {
  texto: string;
  /** First name or full name of who asked: a client contact or a team member. */
  pedidoPor: string;
  /** Words of the transcript and the minute they were said. */
  trecho?: [string, number];
  impacto?: string;
  /** Owner named in the meeting: the minutes automation turned it into a task. */
  responsavel?: string;
  /** Due date of that task, days from today. */
  prazo?: number;
  /** Done: what was done, days after the meeting. */
  feito?: [string, number];
  /** Owner and due date (days from today) the assistant suggests when nobody took it. */
  sugerido?: [string, number];
}

interface RawReuniao {
  dia: Dia;
  hora: string;
  duracao: number;
  titulo: string;
  origem: FonteReuniao;
  /** People of the client: [name, role]. */
  cliente: [string, string][];
  equipe: string[];
  resumo: string;
  combinados: RawCombinado[];
}

/** Days from today, or [meeting index, days after that meeting]. */
type Quando = number | [reuniao: number, dias: number];

type RawEntregavel = [nome: string, prazo: Quando, status: "ENTREGUE" | "APROVACAO" | "ANDAMENTO" | "NAO_INICIADO", responsavel: string];

/** [type, when, text] */
type RawEvento = [Evento["tipo"], Quando, string];

interface Row {
  cliente: string;
  nome: string;
  frente: Frente;
  responsavel: string;
  socio: string;
  equipe: string[];
  valor: number;
  horas: [orcadas: number, lancadas: number];
  /** Percent done (fixed fee only). */
  concluido?: number;
  fase: Fase;
  faseDetalhe: string;
  /** Start and end, days from today. */
  periodo: [inicio: number, fim: number];
  entregaveis: RawEntregavel[];
  /** Newest first. */
  reunioes: RawReuniao[];
  /** Sources may cite {R0} (date of the newest meeting) or {-25} (25 days ago). */
  causas?: Causa[];
  continuidade: { status: Continuidade; texto?: string; valorMensal?: number; evento?: RawEvento };
  meses?: number[];
  acao: string;
}

interface ClienteRow {
  nome: string;
  apelido: string;
  segmento: string;
  cidade: string;
  contato: string;
}

const CLIENTES: ClienteRow[] = [
  { nome: "Distribuidora Ponte Alta", apelido: "Ponte Alta", segmento: "Distribuidora de materiais elétricos, 3 centros de distribuição", cidade: "Curitiba (PR)", contato: "Sérgio Bittencourt, diretor de operações" },
  { nome: "Rede Vitalis de Clínicas", apelido: "Vitalis", segmento: "Rede de clínicas médicas, 9 unidades", cidade: "Campinas (SP)", contato: "Dra. Fabiana Rios, encarregada de dados (DPO)" },
  { nome: "Cerâmica Três Pinheiros", apelido: "Três Pinheiros", segmento: "Indústria de pisos e revestimentos", cidade: "Criciúma (SC)", contato: "Anderson Pavan, gerente industrial" },
  { nome: "Cooperativa Campo Firme", apelido: "Campo Firme", segmento: "Cooperativa agroindustrial, 1.800 cooperados", cidade: "Cascavel (PR)", contato: "Osmar Lindner, presidente" },
  { nome: "Expresso Guaporé", apelido: "Guaporé", segmento: "Transportadora de cargas, 600 funcionários", cidade: "Passo Fundo (RS)", contato: "Dr. Leandro Fachin, diretor jurídico" },
  { nome: "Metalúrgica Fornari", apelido: "Fornari", segmento: "Componentes metálicos para máquinas agrícolas", cidade: "Caxias do Sul (RS)", contato: "Priscila Fornari, diretora industrial" },
  { nome: "Construtora Base Forte", apelido: "Base Forte", segmento: "Construtora e incorporadora, 6 obras ativas", cidade: "Florianópolis (SC)", contato: "Eduardo Kremer, gerente de obras" },
  { nome: "Grupo Educacional Saber Mais", apelido: "Saber Mais", segmento: "Rede de escolas de ensino básico, 5 unidades", cidade: "Londrina (PR)", contato: "Cristina Albuquerque, diretora administrativa" },
  { nome: "Agroindústria Bom Retiro", apelido: "Bom Retiro", segmento: "Abatedouro e processamento de aves", cidade: "Chapecó (SC)", contato: "Jéssica Marcon, coordenadora de sustentabilidade" },
  { nome: "Nuvia Pagamentos", apelido: "Nuvia", segmento: "Fintech de meios de pagamento, 120 pessoas", cidade: "São Paulo (SP)", contato: "Bruno Kenji, CTO" },
  { nome: "Hotéis Maré Alta", apelido: "Maré Alta", segmento: "Rede de hotéis de praia, 4 unidades", cidade: "Balneário Camboriú (SC)", contato: "Patrícia Viana, diretora de operações" },
];

const HELENA = "Helena Duarte";
const MARCELO = "Marcelo Antunes";
const CAMILA = "Camila Rezende";
const THIAGO = "Thiago Moreira";
const LARISSA = "Larissa Peixoto";
const RAFAEL = "Rafael Cunha";
const BEATRIZ = "Beatriz Nogueira";
const GUSTAVO = "Gustavo Lemos";
const ISABELA = "Isabela Prado";
const VINICIUS = "Vinícius Rocha";
const NATALIA = "Natália Freitas";
const JOAO = "João Pedro Alves";
const MARIANA = "Mariana Teles";

const ROWS: Row[] = [
  {
    cliente: "Ponte Alta",
    nome: "Redesenho dos processos de compras e estoque",
    frente: "GESTAO",
    responsavel: CAMILA,
    socio: HELENA,
    equipe: [HELENA, CAMILA, RAFAEL, VINICIUS, JOAO],
    valor: 147_600,
    horas: [640, 512],
    concluido: 70,
    fase: "IMPLANTACAO",
    faseDetalhe: "Novo fluxo de compras rodando no CD de Curitiba",
    periodo: [-150, 62],
    entregaveis: [
      ["Diagnóstico dos processos atuais", -121, "ENTREGUE", CAMILA],
      ["Processo de compras redesenhado", -86, "ENTREGUE", RAFAEL],
      ["Política de compras e alçadas", -58, "ENTREGUE", CAMILA],
      ["Painel de indicadores de compras e estoque", [2, 7], "ENTREGUE", JOAO],
      ["Processo de recebimento (versão 3)", [1, 3], "ENTREGUE", CAMILA],
      ["Treinamento dos compradores de Curitiba", 12, "ANDAMENTO", VINICIUS],
      ["Manual do novo processo de compras", 34, "NAO_INICIADO", RAFAEL],
      ["Relatório final e plano de sustentação", 60, "NAO_INICIADO", CAMILA],
    ],
    reunioes: [
      {
        dia: [2, 0],
        hora: "14:00",
        duracao: 62,
        titulo: "Acompanhamento semanal: validação do fluxo de compras",
        origem: "MEET",
        cliente: [
          ["Sérgio Bittencourt", "diretor de operações"],
          ["Renata Kowalski", "gerente de suprimentos"],
        ],
        equipe: [CAMILA, RAFAEL],
        resumo:
          "Validação do novo fluxo de compras no CD de Curitiba. O Sérgio aprovou o fluxo com dois ajustes (alçada para compras grandes e o CD de Ponta Grossa) e a Renata avisou que o comitê de diretoria da próxima semana vai pedir o comparativo de lead time dos 3 CDs para decidir a fase 2.",
        combinados: [
          {
            texto: "Incluir aprovação por alçada para compras acima de R$ 50 mil no novo fluxo",
            pedidoPor: "Sérgio Bittencourt",
            trecho: ["Compra acima de 50 mil tem que passar por mim antes de virar pedido. Isso precisa estar no fluxo.", 14],
            sugerido: [CAMILA, 3],
          },
          {
            texto: "Enviar o comparativo de lead time dos 3 CDs antes do comitê de diretoria",
            pedidoPor: "Renata Kowalski",
            trecho: ["Se eu levar o comparativo de lead time dos três CDs pro comitê, a diretoria aprova a fase 2.", 31],
            impacto: "É o que a Renata leva ao comitê para aprovar a fase 2 (R$ 186 mil no Comercial)",
            sugerido: [RAFAEL, 4],
          },
          {
            texto: "Treinar os 6 compradores do CD de Ponta Grossa no novo fluxo",
            pedidoPor: "Sérgio Bittencourt",
            trecho: ["O pessoal de Ponta Grossa também precisa ser treinado, senão volta tudo pro jeito antigo.", 48],
            sugerido: [VINICIUS, 10],
          },
          {
            texto: "Revisar a fórmula do indicador de ruptura de estoque",
            pedidoPor: "Renata Kowalski",
            responsavel: RAFAEL,
            prazo: 1,
          },
        ],
      },
      {
        dia: [2, 1],
        hora: "14:00",
        duracao: 55,
        titulo: "Acompanhamento semanal: processo de recebimento",
        origem: "MEET",
        cliente: [["Renata Kowalski", "gerente de suprimentos"]],
        equipe: [CAMILA, VINICIUS],
        resumo:
          "Revisão do processo de recebimento (versão 2) e dos itens que mais faltam no CD de Curitiba. A Renata pediu a versão 3 com conferência por amostragem e quer que a equipe conheça a operação de Ponta Grossa antes de levar o fluxo para lá.",
        combinados: [
          {
            texto: "Enviar o processo de recebimento revisado (versão 3) com conferência por amostragem",
            pedidoPor: "Renata Kowalski",
            responsavel: CAMILA,
            feito: ["Versão 3 enviada por e-mail e aprovada pela Renata", 3],
          },
          {
            texto: "Levantar os 40 itens com mais ruptura no CD de Curitiba",
            pedidoPor: "Renata Kowalski",
            responsavel: VINICIUS,
            prazo: -1,
          },
          {
            texto: "Agendar a visita técnica ao CD de Ponta Grossa",
            pedidoPor: "Renata Kowalski",
            trecho: ["Antes de levar isso pra Ponta Grossa eu queria que vocês vissem a operação de lá.", 37],
            sugerido: [CAMILA, 5],
          },
        ],
      },
      {
        dia: [2, 2],
        hora: "09:00",
        duracao: 118,
        titulo: "Workshop de indicadores com a diretoria",
        origem: "ZOOM",
        cliente: [
          ["Sérgio Bittencourt", "diretor de operações"],
          ["Renata Kowalski", "gerente de suprimentos"],
          ["Mário Leal", "diretor financeiro"],
        ],
        equipe: [HELENA, CAMILA, JOAO],
        resumo:
          "Definição das metas do painel de compras e estoque com a diretoria. Ficou decidido que o diretor financeiro entra nas reuniões quinzenais e que a implantação nos 3 CDs precisa de cronograma antes de qualquer expansão.",
        combinados: [
          { texto: "Definir as 5 metas do painel de compras e estoque", pedidoPor: "Sérgio Bittencourt", responsavel: JOAO, feito: ["Metas no painel, entregue e validado com a diretoria", 7] },
          { texto: "Incluir o diretor financeiro nas reuniões quinzenais", pedidoPor: "Mário Leal", responsavel: CAMILA, feito: ["Convite recorrente enviado e aceito", 1] },
          { texto: "Propor o cronograma de implantação nos 3 CDs", pedidoPor: "Sérgio Bittencourt", responsavel: CAMILA, prazo: 5 },
        ],
      },
    ],
    causas: [
      { texto: "Ajustes no fluxo de compras pedidos nas reuniões de acompanhamento, fora do desenho aprovado", horas: 46, fonte: "Reuniões de {R1} e {R0}" },
      { texto: "CD de Ponta Grossa entrou no mapeamento; a proposta previa 2 CDs", horas: 30, fonte: "Proposta + workshop de {R2}" },
      { texto: "Processo de recebimento refeito até a versão 3", horas: 15, fonte: "Lançamento de horas" },
    ],
    continuidade: {
      status: "EM_CONVERSA",
      texto: "Fase 2: implantação nos CDs de Ponta Grossa e Joinville (R$ 186 mil), em diagnóstico no Comercial",
      evento: ["REUNIAO", [0, 0], "Renata: “Se eu levar o comparativo de lead time dos três CDs pro comitê, a diretoria aprova a fase 2.”"],
    },
    acao: "Propor aditivo pelas 30h do CD de Ponta Grossa, que não estava na proposta.",
  },
  {
    cliente: "Vitalis",
    nome: "Adequação da rede de clínicas à LGPD",
    frente: "COMPLIANCE",
    responsavel: THIAGO,
    socio: MARCELO,
    equipe: [MARCELO, THIAGO, ISABELA, MARIANA],
    valor: 92_000,
    horas: [380, 241],
    concluido: 62,
    fase: "IMPLANTACAO",
    faseDetalhe: "Termos de consentimento e contratos com terceiros",
    periodo: [-110, 48],
    entregaveis: [
      ["Inventário de dados pessoais", -82, "ENTREGUE", ISABELA],
      ["Relatório de riscos e lacunas", [2, 3], "ENTREGUE", THIAGO],
      ["Política de privacidade e de retenção", [1, 4], "ENTREGUE", ISABELA],
      ["Termos de consentimento revisados", 6, "ANDAMENTO", ISABELA],
      ["Relatório de impacto do prontuário eletrônico", 25, "ANDAMENTO", MARIANA],
      ["Treinamento das recepções das 9 unidades", 40, "NAO_INICIADO", THIAGO],
    ],
    reunioes: [
      {
        dia: [4, 0],
        hora: "10:00",
        duracao: 50,
        titulo: "Comitê de privacidade",
        origem: "ZOOM",
        cliente: [
          ["Fabiana Rios", "encarregada de dados (DPO)"],
          ["Henrique Sales", "gerente de TI"],
        ],
        equipe: [THIAGO, ISABELA],
        resumo:
          "Andamento dos termos de consentimento e o e-mail com exame enviado ao paciente errado na unidade Cambuí. A Dra. Fabiana pediu prioridade para o agendamento online, que entra no ar no fim do mês ainda com o termo antigo.",
        combinados: [
          {
            texto: "Revisar o termo de consentimento do agendamento online antes do lançamento do app",
            pedidoPor: "Fabiana Rios",
            trecho: ["O app de agendamento entra no ar no fim do mês e o termo ainda é o antigo. Isso não pode passar.", 22],
            impacto: "O app entra no ar no fim do mês com o termo antigo",
            sugerido: [ISABELA, 5],
          },
          { texto: "Registrar o incidente da unidade Cambuí e avaliar a comunicação à ANPD", pedidoPor: "Fabiana Rios", responsavel: THIAGO, feito: ["Incidente registrado; a avaliação concluiu que não precisa comunicar", 1] },
          { texto: "Mandar o modelo de cláusula de proteção de dados para os contratos com laboratórios", pedidoPor: "Henrique Sales", responsavel: MARIANA, prazo: 2 },
        ],
      },
      {
        dia: [4, 2],
        hora: "10:00",
        duracao: 45,
        titulo: "Comitê de privacidade",
        origem: "ZOOM",
        cliente: [["Fabiana Rios", "encarregada de dados (DPO)"]],
        equipe: [THIAGO, ISABELA],
        resumo: "Aprovação da política de privacidade e de retenção e o cronograma do relatório de impacto do prontuário eletrônico.",
        combinados: [
          { texto: "Publicar a política de privacidade no site e na intranet", pedidoPor: "Fabiana Rios", responsavel: ISABELA, feito: ["Política publicada no site e na intranet", 4] },
          { texto: "Agendar as entrevistas do relatório de impacto com TI e faturamento", pedidoPor: "Fabiana Rios", responsavel: MARIANA, feito: ["Entrevistas feitas com TI e faturamento", 6] },
        ],
      },
      {
        dia: [4, 4],
        hora: "10:00",
        duracao: 60,
        titulo: "Apresentação do relatório de riscos",
        origem: "ZOOM",
        cliente: [
          ["Fabiana Rios", "encarregada de dados (DPO)"],
          ["Paulo Vitali", "diretor executivo"],
        ],
        equipe: [MARCELO, THIAGO],
        resumo: "Apresentação das lacunas encontradas. A diretoria pediu começar pelas unidades que ainda usam prontuário em papel.",
        combinados: [{ texto: "Priorizar as 3 unidades com prontuário em papel no plano de ação", pedidoPor: "Paulo Vitali", responsavel: THIAGO, feito: ["Plano de ação revisado com as 3 unidades primeiro", 2] }],
      },
    ],
    continuidade: { status: "SEM_PROPOSTA" },
    acao: "No orçamento. Acompanhar o relatório de impacto do prontuário eletrônico, a próxima entrega grande.",
  },
  {
    cliente: "Três Pinheiros",
    nome: "Licenciamento ambiental da ampliação da fábrica",
    frente: "AMBIENTAL",
    responsavel: LARISSA,
    socio: MARCELO,
    equipe: [MARCELO, LARISSA, BEATRIZ, NATALIA],
    valor: 118_000,
    horas: [460, 298],
    concluido: 60,
    fase: "IMPLANTACAO",
    faseDetalhe: "Licença de instalação protocolada, respondendo às exigências do órgão ambiental",
    periodo: [-140, 75],
    entregaveis: [
      ["Diagnóstico ambiental e enquadramento", -112, "ENTREGUE", BEATRIZ],
      ["Estudo de impacto de vizinhança", -71, "ENTREGUE", BEATRIZ],
      ["Plano de controle ambiental", -44, "ENTREGUE", LARISSA],
      ["Protocolo do pedido de licença de instalação", [1, 2], "ENTREGUE", LARISSA],
      ["Resposta ao pedido de complementação do órgão ambiental", 14, "ANDAMENTO", BEATRIZ],
      ["Programa de monitoramento de efluentes", 45, "NAO_INICIADO", NATALIA],
      ["Acompanhamento até a emissão da licença", 75, "NAO_INICIADO", LARISSA],
    ],
    reunioes: [
      {
        dia: [1, 0],
        hora: "15:00",
        duracao: 70,
        titulo: "Pedido de complementação do órgão ambiental",
        origem: "MEET",
        cliente: [
          ["Anderson Pavan", "gerente industrial"],
          ["Luciana Damiani", "técnica de segurança e meio ambiente"],
        ],
        equipe: [LARISSA, BEATRIZ],
        resumo:
          "O órgão ambiental pediu complementação do estudo: laudo de ruído noturno e detalhamento do tratamento de efluentes, com 20 dias para responder. O Anderson autorizou contratar o laudo, desde que receba o orçamento antes.",
        combinados: [
          {
            texto: "Contratar o laudo de ruído noturno com o laboratório",
            pedidoPor: "Anderson Pavan",
            trecho: ["Pode contratar o laudo de ruído, só me manda o orçamento antes de fechar.", 26],
            impacto: "Sem o laudo, a resposta ao órgão ambiental não sai no prazo de 20 dias",
            sugerido: [NATALIA, 2],
          },
          { texto: "Preparar a resposta à complementação dentro dos 20 dias", pedidoPor: "Anderson Pavan", responsavel: BEATRIZ, prazo: 14 },
          { texto: "Enviar ao Anderson a lista de documentos da fábrica para a resposta", pedidoPor: LARISSA, responsavel: LARISSA, feito: ["Lista enviada por e-mail no mesmo dia", 0] },
        ],
      },
      {
        dia: [1, 3],
        hora: "15:00",
        duracao: 40,
        titulo: "Alinhamento do protocolo da licença",
        origem: "MEET",
        cliente: [["Anderson Pavan", "gerente industrial"]],
        equipe: [LARISSA, BEATRIZ],
        resumo: "Conferência final dos documentos e da taxa antes de protocolar o pedido de licença de instalação.",
        combinados: [
          { texto: "Protocolar o pedido de licença de instalação", pedidoPor: "Anderson Pavan", responsavel: LARISSA, feito: ["Pedido protocolado, número no Drive do projeto", 2] },
          { texto: "Enviar ao cliente o calendário de condicionantes previstas", pedidoPor: "Luciana Damiani", responsavel: BEATRIZ, feito: ["Calendário enviado", 4] },
        ],
      },
    ],
    continuidade: { status: "SEM_PROPOSTA" },
    acao: "Acompanhar a resposta à complementação: o prazo de 20 dias do órgão ambiental não pode passar.",
  },
  {
    cliente: "Campo Firme",
    nome: "Planejamento estratégico 2027-2029",
    frente: "ESTRATEGIA",
    responsavel: GUSTAVO,
    socio: HELENA,
    equipe: [HELENA, GUSTAVO, JOAO],
    valor: 96_000,
    horas: [360, 338],
    concluido: 92,
    fase: "ENCERRAMENTO",
    faseDetalhe: "Aprovação do plano no conselho de administração",
    periodo: [-160, 12],
    entregaveis: [
      ["Diagnóstico estratégico e entrevistas", -131, "ENTREGUE", GUSTAVO],
      ["Análise de mercado e cenários", -96, "ENTREGUE", JOAO],
      ["Workshop de direcionamento com o conselho", -62, "ENTREGUE", HELENA],
      ["Mapa estratégico e metas de 2027", [1, 2], "ENTREGUE", GUSTAVO],
      ["Plano de ação por diretoria", [0, 2], "APROVACAO", GUSTAVO],
      ["Apresentação final ao conselho", 12, "ANDAMENTO", HELENA],
    ],
    reunioes: [
      {
        dia: [3, 1],
        hora: "16:00",
        duracao: 92,
        titulo: "Validação do plano de ação com as diretorias",
        origem: "ZOOM",
        cliente: [
          ["Osmar Lindner", "presidente"],
          ["Clarice Bauer", "diretora financeira"],
        ],
        equipe: [HELENA, GUSTAVO],
        resumo:
          "Validação do plano de ação de cada diretoria. O Osmar aprovou o plano e, no fim, perguntou quem vai acompanhar a execução das metas depois da entrega; a pergunta ficou sem resposta.",
        combinados: [
          { texto: "Ajustar as metas da diretoria comercial para 2027", pedidoPor: "Clarice Bauer", responsavel: GUSTAVO, feito: ["Metas ajustadas e reenviadas à Clarice", 2] },
          { texto: "Preparar a apresentação final para o conselho", pedidoPor: "Osmar Lindner", responsavel: HELENA, prazo: 8 },
        ],
      },
      {
        dia: [3, 3],
        hora: "16:00",
        duracao: 120,
        titulo: "Workshop de metas com as diretorias",
        origem: "ZOOM",
        cliente: [
          ["Osmar Lindner", "presidente"],
          ["Clarice Bauer", "diretora financeira"],
          ["Nelson Kunz", "diretor de operações"],
        ],
        equipe: [HELENA, GUSTAVO, JOAO],
        resumo: "Definição das metas de 2027 por diretoria e dos indicadores do mapa estratégico.",
        combinados: [
          { texto: "Enviar o mapa estratégico em versão para impressão", pedidoPor: "Osmar Lindner", responsavel: GUSTAVO, feito: ["Mapa enviado em PDF e impresso para o conselho", 2] },
          { texto: "Incluir um indicador de sucessão nas propriedades dos cooperados", pedidoPor: "Nelson Kunz", responsavel: JOAO, feito: ["Indicador incluído no mapa", 3] },
        ],
      },
    ],
    continuidade: {
      status: "SEM_PROPOSTA",
      texto: "Acompanhamento trimestral da execução do plano: reuniões de metas, painel e revisão anual",
      valorMensal: 9_800,
      evento: ["REUNIAO", [0, 0], "Osmar, aos 84 min: “Depois que vocês entregarem, quem acompanha essas metas com a gente?”"],
    },
    acao: "Mandar a proposta de acompanhamento trimestral antes da apresentação ao conselho: o Osmar já perguntou quem acompanha as metas em 2027.",
  },
  {
    cliente: "Guaporé",
    nome: "Programa de compliance e canal de denúncias",
    frente: "COMPLIANCE",
    responsavel: THIAGO,
    socio: MARCELO,
    equipe: [MARCELO, THIAGO, ISABELA],
    valor: 84_000,
    horas: [320, 309],
    concluido: 95,
    fase: "ENCERRAMENTO",
    faseDetalhe: "Relatório final ao conselho",
    periodo: [-150, 9],
    entregaveis: [
      ["Avaliação de riscos de integridade", -121, "ENTREGUE", ISABELA],
      ["Código de conduta", -92, "ENTREGUE", THIAGO],
      ["Políticas anticorrupção e de brindes", -61, "ENTREGUE", ISABELA],
      ["Canal de denúncias no ar", [1, 1], "ENTREGUE", THIAGO],
      ["Procedimento de investigação interna", -14, "ENTREGUE", MARCELO],
      ["Treinamento das 40 lideranças", [0, 0], "ENTREGUE", ISABELA],
      ["Relatório final ao conselho", 9, "ANDAMENTO", THIAGO],
    ],
    reunioes: [
      {
        dia: [5, 0],
        hora: "09:00",
        duracao: 48,
        titulo: "Fechamento do treinamento das lideranças",
        origem: "MEET",
        cliente: [
          ["Leandro Fachin", "diretor jurídico"],
          ["Sueli Brandt", "gerente de RH"],
        ],
        equipe: [THIAGO, ISABELA],
        resumo: "Balanço do treinamento das 40 lideranças e do primeiro mês do canal de denúncias (11 relatos recebidos, 2 em apuração).",
        combinados: [
          { texto: "Mandar a lista de presença do treinamento ao RH", pedidoPor: "Sueli Brandt", responsavel: ISABELA, feito: ["Lista e certificados enviados à Sueli", 1] },
          { texto: "Enviar o relatório final ao conselho", pedidoPor: "Leandro Fachin", responsavel: THIAGO, prazo: 7 },
        ],
      },
      {
        dia: [5, 2],
        hora: "09:00",
        duracao: 40,
        titulo: "Lançamento do canal de denúncias",
        origem: "MEET",
        cliente: [["Leandro Fachin", "diretor jurídico"]],
        equipe: [THIAGO, ISABELA],
        resumo: "Canal no ar. Combinada a divulgação nas filiais e o fluxo de triagem enquanto o projeto durar.",
        combinados: [{ texto: "Divulgar o canal nos murais das 12 filiais", pedidoPor: "Leandro Fachin", responsavel: ISABELA, feito: ["Cartazes enviados às 12 filiais", 3] }],
      },
    ],
    continuidade: {
      status: "SEM_PROPOSTA",
      texto: "Gestão do canal de denúncias (triagem e apuração) e treinamento anual das lideranças",
      valorMensal: 6_500,
      evento: ["EMAIL", -10, "Dr. Leandro perguntou quem faz a triagem das denúncias depois que o projeto acabar"],
    },
    acao: "Mandar a proposta de gestão do canal junto com o relatório final: o Dr. Leandro já perguntou quem faz a triagem depois da entrega.",
  },
  {
    cliente: "Fornari",
    nome: "Implantação da ISO 9001",
    frente: "GESTAO",
    responsavel: CAMILA,
    socio: HELENA,
    equipe: [HELENA, CAMILA, VINICIUS],
    valor: 72_000,
    horas: [300, 291],
    concluido: 90,
    fase: "ENCERRAMENTO",
    faseDetalhe: "Auditoria de certificação",
    periodo: [-180, 14],
    entregaveis: [
      ["Diagnóstico de aderência à norma", -152, "ENTREGUE", CAMILA],
      ["Manual da qualidade e procedimentos", -101, "ENTREGUE", CAMILA],
      ["Treinamento de auditores internos", -63, "ENTREGUE", VINICIUS],
      ["Auditoria interna", [1, 3], "ENTREGUE", CAMILA],
      ["Análise crítica pela direção", [0, -2], "ENTREGUE", CAMILA],
      ["Acompanhamento da auditoria de certificação", 14, "ANDAMENTO", CAMILA],
    ],
    reunioes: [
      {
        dia: [4, 1],
        hora: "08:30",
        duracao: 55,
        titulo: "Preparação para a auditoria de certificação",
        origem: "MEET",
        cliente: [["Priscila Fornari", "diretora industrial"]],
        equipe: [CAMILA, VINICIUS],
        resumo: "Revisão das 3 não conformidades da auditoria interna e da agenda da certificadora. A Priscila pediu a proposta de manutenção do sistema para depois da certificação.",
        combinados: [
          { texto: "Fechar as 3 não conformidades da auditoria interna", pedidoPor: "Priscila Fornari", responsavel: VINICIUS, prazo: 3 },
          { texto: "Mandar a proposta de manutenção do sistema da qualidade", pedidoPor: "Priscila Fornari", responsavel: "DONO", feito: ["Proposta enviada por e-mail: R$ 4.200/mês", 2] },
        ],
      },
      {
        dia: [4, 3],
        hora: "08:30",
        duracao: 50,
        titulo: "Resultado da auditoria interna",
        origem: "MEET",
        cliente: [["Priscila Fornari", "diretora industrial"]],
        equipe: [CAMILA],
        resumo: "Apresentação da auditoria interna: 3 não conformidades menores, nenhuma maior.",
        combinados: [{ texto: "Agendar a análise crítica pela direção", pedidoPor: "Priscila Fornari", responsavel: CAMILA, feito: ["Análise crítica feita com a diretoria", 12] }],
      },
    ],
    continuidade: {
      status: "PROPOSTA_ENVIADA",
      texto: "Manutenção do sistema da qualidade e auditoria interna anual",
      valorMensal: 4_200,
      evento: ["PROPOSTA", [0, 2], "Proposta de manutenção do sistema enviada à Priscila: R$ 4.200/mês"],
    },
    acao: "Proposta de manutenção enviada. Confirmar com a Priscila antes da auditoria de certificação.",
  },
  {
    cliente: "Base Forte",
    nome: "Gestão das condicionantes ambientais das obras",
    frente: "AMBIENTAL",
    responsavel: LARISSA,
    socio: MARCELO,
    equipe: [LARISSA, BEATRIZ, NATALIA],
    valor: 12_400,
    horas: [48, 46],
    fase: "ACOMPANHAMENTO",
    faseDetalhe: "Relatório mensal das condicionantes de 6 obras",
    periodo: [-300, 240],
    entregaveis: [
      ["Relatório de condicionantes de agosto", -39, "ENTREGUE", NATALIA],
      ["Relatório de condicionantes de setembro", -8, "APROVACAO", NATALIA],
      ["Plano de resíduos da obra Itacorubi", 5, "ANDAMENTO", BEATRIZ],
      ["Relatório de condicionantes de outubro", 22, "NAO_INICIADO", NATALIA],
    ],
    reunioes: [
      {
        dia: [3, 0],
        hora: "11:00",
        duracao: 35,
        titulo: "Reunião mensal de condicionantes",
        origem: "MEET",
        cliente: [["Eduardo Kremer", "gerente de obras"]],
        equipe: [LARISSA, BEATRIZ],
        resumo: "Revisão das condicionantes das 6 obras. Entra uma obra nova em Coqueiros a partir de outubro.",
        combinados: [
          { texto: "Incluir a obra nova de Coqueiros no relatório de outubro", pedidoPor: "Eduardo Kremer", responsavel: LARISSA, prazo: 6 },
          { texto: "Mandar o plano de resíduos da obra Itacorubi", pedidoPor: "Eduardo Kremer", responsavel: BEATRIZ, prazo: 5 },
        ],
      },
      {
        dia: [3, 4],
        hora: "11:00",
        duracao: 30,
        titulo: "Reunião mensal de condicionantes",
        origem: "MEET",
        cliente: [["Eduardo Kremer", "gerente de obras"]],
        equipe: [LARISSA],
        resumo: "Condicionantes em dia. Vistoria da fiscalização prevista para a obra Jurerê.",
        combinados: [{ texto: "Acompanhar a vistoria da fiscalização na obra Jurerê", pedidoPor: "Eduardo Kremer", responsavel: LARISSA, feito: ["Vistoria acompanhada, sem autuação", 6] }],
      },
    ],
    continuidade: { status: "RECORRENTE", texto: "Contrato mensal, renova em maio" },
    meses: [44, 47, 45, 49, 44, 46],
    acao: "Dentro do orçado. Incluir a obra de Coqueiros no relatório de outubro.",
  },
  {
    cliente: "Saber Mais",
    nome: "Estrutura organizacional e plano de cargos e salários",
    frente: "PESSOAS",
    responsavel: GUSTAVO,
    socio: HELENA,
    equipe: [HELENA, GUSTAVO, JOAO],
    valor: 68_000,
    horas: [280, 92],
    concluido: 35,
    fase: "DIAGNOSTICO",
    faseDetalhe: "Entrevistas nas 5 unidades e pesquisa salarial",
    periodo: [-45, 96],
    entregaveis: [
      ["Plano de trabalho e cronograma", [1, 3], "ENTREGUE", GUSTAVO],
      ["Descrição dos cargos atuais", -1, "ANDAMENTO", JOAO],
      ["Pesquisa salarial regional", 20, "ANDAMENTO", GUSTAVO],
      ["Nova estrutura organizacional", 55, "NAO_INICIADO", GUSTAVO],
      ["Plano de cargos e salários", 90, "NAO_INICIADO", HELENA],
    ],
    reunioes: [
      {
        dia: [2, 1],
        hora: "16:30",
        duracao: 65,
        titulo: "Entrevistas com os diretores das unidades",
        origem: "MEET",
        cliente: [["Cristina Albuquerque", "diretora administrativa"]],
        equipe: [GUSTAVO, JOAO],
        resumo: "Rodada de entrevistas com os diretores de 3 das 5 unidades. A Cristina pediu incluir os professores horistas na pesquisa salarial.",
        combinados: [
          { texto: "Enviar o questionário de cargos aos coordenadores", pedidoPor: "Cristina Albuquerque", responsavel: JOAO, feito: ["Questionário enviado às 5 unidades", 1] },
          { texto: "Incluir os professores horistas na pesquisa salarial", pedidoPor: "Cristina Albuquerque", responsavel: GUSTAVO, prazo: 4 },
        ],
      },
      {
        dia: [2, 5],
        hora: "16:30",
        duracao: 70,
        titulo: "Abertura do projeto",
        origem: "MEET",
        cliente: [
          ["Cristina Albuquerque", "diretora administrativa"],
          ["Rogério Mattos", "diretor geral"],
        ],
        equipe: [HELENA, GUSTAVO],
        resumo: "Apresentação do plano de trabalho e das unidades que entram primeiro.",
        combinados: [{ texto: "Mandar o cronograma de entrevistas por unidade", pedidoPor: "Rogério Mattos", responsavel: GUSTAVO, feito: ["Cronograma enviado", 2] }],
      },
    ],
    continuidade: { status: "SEM_PROPOSTA" },
    acao: "Abaixo do orçado. Cobrar a descrição dos cargos atuais, atrasada desde ontem.",
  },
  {
    cliente: "Bom Retiro",
    nome: "Inventário de emissões e relatório de sustentabilidade",
    frente: "AMBIENTAL",
    responsavel: LARISSA,
    socio: MARCELO,
    equipe: [LARISSA, BEATRIZ, NATALIA],
    valor: 58_000,
    horas: [240, 126],
    concluido: 50,
    fase: "DESENHO",
    faseDetalhe: "Cálculo do inventário de emissões de 2025",
    periodo: [-70, 55],
    entregaveis: [
      ["Levantamento de energia, frota e efluentes", -22, "ENTREGUE", NATALIA],
      ["Inventário de emissões de 2025", 10, "ANDAMENTO", BEATRIZ],
      ["Matriz de materialidade", 25, "ANDAMENTO", LARISSA],
      ["Relatório de sustentabilidade", 55, "NAO_INICIADO", LARISSA],
    ],
    reunioes: [
      {
        dia: [4, 1],
        hora: "14:00",
        duracao: 50,
        titulo: "Revisão dos dados de emissões",
        origem: "ZOOM",
        cliente: [["Jéssica Marcon", "coordenadora de sustentabilidade"]],
        equipe: [LARISSA, NATALIA],
        resumo: "Revisão do levantamento: o consumo de diesel da frota estava estimado. A Jéssica pediu incluir as granjas integradas nas emissões indiretas.",
        combinados: [
          { texto: "Recalcular as emissões da frota com o consumo real de diesel", pedidoPor: "Jéssica Marcon", responsavel: NATALIA, feito: ["Recalculado com as notas de combustível", 3] },
          { texto: "Incluir as granjas integradas nas emissões indiretas", pedidoPor: "Jéssica Marcon", responsavel: BEATRIZ, prazo: 10 },
        ],
      },
      {
        dia: [4, 5],
        hora: "14:00",
        duracao: 45,
        titulo: "Abertura do projeto",
        origem: "ZOOM",
        cliente: [["Jéssica Marcon", "coordenadora de sustentabilidade"]],
        equipe: [LARISSA, BEATRIZ],
        resumo: "Escopo do inventário e lista de dados que a fábrica precisa levantar.",
        combinados: [{ texto: "Mandar a lista de dados necessários para o inventário", pedidoPor: "Jéssica Marcon", responsavel: NATALIA, feito: ["Lista enviada", 1] }],
      },
    ],
    continuidade: { status: "SEM_PROPOSTA" },
    acao: "No orçamento. Fechar o escopo das granjas integradas antes do cálculo final.",
  },
  {
    cliente: "Nuvia",
    nome: "Adequação à LGPD e política de segurança da informação",
    frente: "COMPLIANCE",
    responsavel: THIAGO,
    socio: MARCELO,
    equipe: [THIAGO, ISABELA, MARIANA],
    valor: 76_000,
    horas: [300, 72],
    concluido: 25,
    fase: "DIAGNOSTICO",
    faseDetalhe: "Mapeamento de dados e entrevistas com as áreas",
    periodo: [-30, 110],
    entregaveis: [
      ["Plano de trabalho", [1, 2], "ENTREGUE", THIAGO],
      ["Inventário de dados pessoais", 12, "ANDAMENTO", MARIANA],
      ["Avaliação de segurança da informação", 30, "NAO_INICIADO", ISABELA],
      ["Políticas de privacidade e de segurança", 70, "NAO_INICIADO", ISABELA],
      ["Treinamento das equipes", 105, "NAO_INICIADO", THIAGO],
    ],
    reunioes: [
      {
        dia: [1, 1],
        hora: "17:00",
        duracao: 58,
        titulo: "Entrevistas com produto e engenharia",
        origem: "MEET",
        cliente: [["Bruno Kenji", "CTO"]],
        equipe: [THIAGO, MARIANA],
        resumo: "Mapeamento dos dados do onboarding de lojistas e da esteira de antifraude. O Bruno pediu o checklist de evidências para a auditoria do banco parceiro.",
        combinados: [
          { texto: "Mapear os dados do onboarding de lojistas", pedidoPor: "Bruno Kenji", responsavel: MARIANA, prazo: 5 },
          { texto: "Mandar o checklist de evidências para a auditoria do banco parceiro", pedidoPor: "Bruno Kenji", responsavel: THIAGO, feito: ["Checklist enviado", 2] },
        ],
      },
      {
        dia: [1, 3],
        hora: "17:00",
        duracao: 40,
        titulo: "Abertura do projeto",
        origem: "MEET",
        cliente: [["Bruno Kenji", "CTO"]],
        equipe: [THIAGO],
        resumo: "Escopo, entrevistados e cronograma do diagnóstico.",
        combinados: [{ texto: "Mandar o cronograma de entrevistas", pedidoPor: "Bruno Kenji", responsavel: THIAGO, feito: ["Cronograma enviado", 1] }],
      },
    ],
    continuidade: { status: "SEM_PROPOSTA" },
    acao: "No orçamento. Nada a fazer agora.",
  },
  {
    cliente: "Maré Alta",
    nome: "Mapeamento de processos e manual operacional dos hotéis",
    frente: "GESTAO",
    responsavel: RAFAEL,
    socio: HELENA,
    equipe: [HELENA, RAFAEL, VINICIUS, JOAO],
    valor: 64_000,
    horas: [260, 236],
    concluido: 78,
    fase: "IMPLANTACAO",
    faseDetalhe: "Manual operacional e treinamento das recepções",
    periodo: [-100, 30],
    entregaveis: [
      ["Processos de recepção e governança", [2, 3], "ENTREGUE", RAFAEL],
      ["Processos de alimentos e bebidas", -45, "ENTREGUE", VINICIUS],
      ["Processos do hotel de Bombinhas", [1, 10], "ENTREGUE", JOAO],
      ["Manual operacional dos 4 hotéis", -2, "ANDAMENTO", RAFAEL],
      ["Treinamento das recepções", 20, "NAO_INICIADO", VINICIUS],
    ],
    reunioes: [
      {
        dia: [3, 0],
        hora: "15:00",
        duracao: 52,
        titulo: "Revisão do manual operacional",
        origem: "MEET",
        cliente: [["Patrícia Viana", "diretora de operações"]],
        equipe: [RAFAEL, VINICIUS],
        resumo: "Revisão do rascunho do manual. A Patrícia pediu incluir o atendimento por WhatsApp e quer as recepções treinadas antes do feriado.",
        combinados: [
          { texto: "Incluir o padrão de atendimento por WhatsApp no manual", pedidoPor: "Patrícia Viana", responsavel: RAFAEL, prazo: 3 },
          { texto: "Treinar as recepções no novo check-in", pedidoPor: "Patrícia Viana", responsavel: VINICIUS, prazo: 20 },
        ],
      },
      {
        dia: [3, 3],
        hora: "15:00",
        duracao: 47,
        titulo: "Inclusão do hotel de Bombinhas",
        origem: "MEET",
        cliente: [["Patrícia Viana", "diretora de operações"]],
        equipe: [RAFAEL, JOAO],
        resumo: "A rede assumiu o hotel de Bombinhas e a Patrícia pediu incluí-lo no mapeamento. A proposta previa 3 hotéis.",
        combinados: [{ texto: "Mapear os processos do hotel de Bombinhas", pedidoPor: "Patrícia Viana", responsavel: JOAO, feito: ["Processos do hotel de Bombinhas entregues", 10] }],
      },
      {
        dia: [3, 6],
        hora: "15:00",
        duracao: 60,
        titulo: "Validação dos processos de recepção",
        origem: "MEET",
        cliente: [["Patrícia Viana", "diretora de operações"]],
        equipe: [RAFAEL, VINICIUS],
        resumo: "Validação dos processos de recepção e governança dos 3 hotéis.",
        combinados: [{ texto: "Padronizar o checklist de governança dos quartos", pedidoPor: "Patrícia Viana", responsavel: VINICIUS, feito: ["Checklist padronizado e enviado", 4] }],
      },
    ],
    causas: [
      { texto: "Hotel de Bombinhas entrou no mapeamento; a proposta previa 3 hotéis", horas: 28, fonte: "Proposta + reunião de {R1}" },
      { texto: "Check-in revisado duas vezes depois da troca do sistema de reservas", horas: 15, fonte: "E-mail de {-25} + lançamento de horas" },
    ],
    continuidade: {
      status: "SEM_PROPOSTA",
      texto: "Acompanhamento mensal dos indicadores de operação dos 4 hotéis",
      valorMensal: 3_800,
    },
    acao: "Propor aditivo pelas 28h do hotel de Bombinhas, que entrou depois da proposta, e cobrar o manual operacional, atrasado.",
  },
];

/** Hours of each person last week, by project nickname (expected: 40h). */
const SEMANA: Record<string, [string, number][]> = {
  [HELENA]: [["Campo Firme", 14], ["Ponte Alta", 8], ["Saber Mais", 6], ["Maré Alta", 6], ["Fornari", 4]],
  [MARCELO]: [["Guaporé", 12], ["Três Pinheiros", 10], ["Vitalis", 8], ["Bom Retiro", 6]],
  [CAMILA]: [["Ponte Alta", 24], ["Fornari", 18]],
  [THIAGO]: [["Vitalis", 14], ["Nuvia", 14], ["Guaporé", 12]],
  [LARISSA]: [["Três Pinheiros", 16], ["Base Forte", 12], ["Bom Retiro", 12]],
  [RAFAEL]: [["Ponte Alta", 22], ["Maré Alta", 19]],
  [BEATRIZ]: [["Três Pinheiros", 20], ["Bom Retiro", 12], ["Base Forte", 7]],
  [GUSTAVO]: [["Campo Firme", 14], ["Saber Mais", 8]],
  [ISABELA]: [["Vitalis", 18], ["Nuvia", 12], ["Guaporé", 10]],
  [VINICIUS]: [["Ponte Alta", 14], ["Fornari", 6], ["Maré Alta", 6]],
  [NATALIA]: [["Três Pinheiros", 6], ["Base Forte", 6], ["Bom Retiro", 4]],
  [JOAO]: [["Ponte Alta", 14], ["Saber Mais", 12], ["Maré Alta", 8], ["Campo Firme", 6]],
  [MARIANA]: [["Nuvia", 22], ["Vitalis", 16]],
};

// ---- seed -------------------------------------------------------------------------------------------

/** What the store keeps of an agreed item; status and dates come from its task, on every read. */
export interface CombinadoBase {
  id: string;
  reuniaoId: string;
  projetoId: string;
  apelido: string;
  texto: string;
  pedidoPor: string;
  trecho: string | null;
  minuto: number | null;
  impacto: string | null;
  /** Owner named in the meeting; "DONO" stands for the person who signs in. */
  responsavel: string | null;
  tarefaId: string | null;
  /** Due date of the task to create, days from today (owned items). */
  prazo: number | null;
  /** Done: what was done and the day (ISO date). */
  feito: [string, string] | null;
  sugerido: string;
  prazoSugerido: string;
  fonte: string;
  /** Day of the meeting, for the task's creation date. */
  data: string;
}

export type ProjetoBase = Omit<
  Projeto,
  "entregas" | "reunioes" | "ultimaReuniao" | "combinadosSemResponsavel" | "combinadosAbertos" | "avisos"
>;

export type ReuniaoBase = Omit<Reuniao, "combinados" | "feitos" | "semResponsavel">;

export type EntregavelBase = Omit<Entregavel, "status"> & { feito: "ENTREGUE" | "APROVACAO" | "ANDAMENTO" | "NAO_INICIADO" };

const NIVEL_DE = new Map<string, Nivel>(EQUIPE.map((p) => [p.nome, p.nivel]));
const CARGO_DE = new Map<string, string>(EQUIPE.map((p) => [p.nome, p.cargo]));

/** Share of the hours by level when a timesheet is not detailed: seniors and managers carry the work. */
const PESO: Record<Nivel, number> = { Sócio: 0.06, Gerente: 0.25, Sênior: 0.35, Consultor: 0.25, Analista: 0.2 };

function pessoasDe(equipe: string[], horas: number): HorasPessoa[] {
  const total = equipe.reduce((s, n) => s + PESO[NIVEL_DE.get(n) ?? "Consultor"], 0);
  const split = equipe.map((n) => [n, Math.round((horas * PESO[NIVEL_DE.get(n) ?? "Consultor"]) / total)] as [string, number]);
  // Rounding goes to the person with the most hours, so the sum matches the timesheet.
  const diff = horas - split.reduce((s, [, h]) => s + h, 0);
  [...split].sort((a, b) => b[1] - a[1])[0][1] += diff;
  return split.map(([nome, h]) => {
    const nivel = NIVEL_DE.get(nome) ?? "Consultor";
    return { nome, nivel, custoHora: CUSTO_HORA[nivel], horas: h };
  });
}

const margem = (valor: number, custo: number) => Math.round(((valor - custo) / valor) * 100);

export function seedConsultoria() {
  const clientes: Cliente[] = CLIENTES.map((c, i) => ({ id: `cli-${String(i + 1).padStart(2, "0")}`, ...c }));
  const projetos: ProjetoBase[] = [];
  const reunioes: ReuniaoBase[] = [];
  const combinados: CombinadoBase[] = [];
  const entregaveis: EntregavelBase[] = [];

  ROWS.forEach((row, index) => {
    const cliente = clientes.find((c) => c.apelido === row.cliente)!;
    const projetoId = `prj-${String(index + 1).padStart(2, "0")}`;
    const datas = row.reunioes.map((r) => isoDay(ultimo(r.dia[0], r.dia[1])));
    const offsets = row.reunioes.map((r) => ultimo(r.dia[0], r.dia[1]));
    // A day after a meeting never lands after today: what was done, was done by now.
    const quando = (q: Quando) => diaUtil(typeof q === "number" ? q : Math.min(offsets[q[0]] + q[1], 0));
    const dated = (text: string) =>
      text.replace(/\{R(\d)\}/g, (_, i) => shortDay(datas[Number(i)])).replace(/\{(-?\d+)\}/g, (_, n) => shortDay(isoDay(Number(n))));

    row.reunioes.forEach((r, ri) => {
      const reuniaoId = `${projetoId}-r${ri + 1}`;
      const data = datas[ri];
      const fonte = fonteReuniao(data, r.origem);
      reunioes.push({
        id: reuniaoId,
        projetoId,
        projeto: row.nome,
        clienteId: cliente.id,
        cliente: cliente.nome,
        apelido: cliente.apelido,
        frente: row.frente,
        titulo: r.titulo,
        data,
        hora: r.hora,
        duracaoMin: r.duracao,
        origem: r.origem,
        fonte,
        participantes: [
          ...r.cliente.map(([nome, papel]) => ({ nome, papel, lado: "CLIENTE" as const })),
          ...r.equipe.map((nome) => ({ nome, papel: CARGO_DE.get(nome) ?? "", lado: "EQUIPE" as const })),
        ],
        resumo: r.resumo,
      });
      r.combinados.forEach((c, ci) => {
        const [sugerido, prazoSugerido] = c.sugerido ?? [c.responsavel ?? row.responsavel, 5];
        combinados.push({
          id: `${reuniaoId}-c${ci + 1}`,
          reuniaoId,
          projetoId,
          apelido: cliente.apelido,
          texto: c.texto,
          pedidoPor: c.pedidoPor,
          trecho: c.trecho?.[0] ?? null,
          minuto: c.trecho?.[1] ?? null,
          impacto: c.impacto ?? null,
          responsavel: c.responsavel ?? null,
          tarefaId: null,
          prazo: c.prazo ?? null,
          feito: c.feito ? [c.feito[0], quando([ri, c.feito[1]])] : null,
          sugerido: sugerido === "DONO" ? row.socio : sugerido,
          prazoSugerido: diaUtil(prazoSugerido),
          fonte,
          data,
        });
      });
    });

    row.entregaveis.forEach(([nome, prazo, feito, responsavel], ei) => {
      entregaveis.push({
        id: `${projetoId}-e${ei + 1}`,
        projetoId,
        projeto: row.nome,
        apelido: cliente.apelido,
        cliente: cliente.nome,
        frente: row.frente,
        nome,
        responsavel,
        prazo: quando(prazo),
        feito,
        pasta: `Drive · ${cliente.apelido} / Entregáveis`,
      });
    });

    const mensal = row.concluido === undefined;
    const [orcadas, lancadas] = row.horas;
    const projetadas = mensal ? lancadas : Math.round(lancadas / (row.concluido! / 100));
    const pessoas = pessoasDe(row.equipe, lancadas);
    const custoHora = Math.round((pessoas.reduce((s, p) => s + p.horas * p.custoHora, 0) / lancadas) * 10) / 10;
    const ev = row.continuidade.evento;
    const evento: Evento | null = ev
      ? (() => {
          const [tipo, q, texto] = ev;
          const data = quando(q);
          const fonte =
            tipo === "REUNIAO"
              ? fonteReuniao(datas[(q as [number, number])[0]], row.reunioes[(q as [number, number])[0]].origem)
              : tipo === "EMAIL"
                ? `E-mail de ${shortDay(data)}`
                : tipo === "PROPOSTA"
                  ? `Proposta enviada em ${shortDay(data)}`
                  : "Lançamento de horas";
          return { tipo, fonte, texto, data };
        })()
      : null;
    projetos.push({
      id: projetoId,
      nome: row.nome,
      frente: row.frente,
      cobranca: mensal ? "MENSAL" : "FIXO",
      clienteId: cliente.id,
      cliente: cliente.nome,
      apelido: cliente.apelido,
      segmento: cliente.segmento,
      cidade: cliente.cidade,
      contato: cliente.contato,
      responsavel: row.responsavel,
      socio: row.socio,
      equipe: row.equipe,
      valor: row.valor,
      horasOrcadas: orcadas,
      horasLancadas: lancadas,
      concluido: row.concluido ?? null,
      horasProjetadas: projetadas,
      estouro: Math.round((projetadas / orcadas - 1) * 100),
      horasAcima: Math.max(0, projetadas - orcadas),
      custoHora,
      margemPlanejada: margem(row.valor, orcadas * custoHora),
      margemAtual: margem(row.valor, projetadas * custoHora),
      fase: row.fase,
      faseDetalhe: row.faseDetalhe,
      inicio: isoDay(row.periodo[0]),
      fim: isoDay(row.periodo[1]),
      continuidade: {
        status: row.continuidade.status,
        texto: row.continuidade.texto ?? null,
        valorMensal: row.continuidade.valorMensal ?? null,
        evento,
      },
      pessoas,
      causas: row.causas?.map((c) => ({ ...c, fonte: dated(c.fonte) })) ?? null,
      meses: mensal
        ? (row.meses ?? []).map((horas, i) => ({ mes: MESES[(new Date().getMonth() - (6 - i) + 12) % 12], horas }))
        : null,
      acaoSugerida: dated(row.acao),
    });
  });

  return { clientes, projetos, reunioes, combinados, entregaveis };
}

type Pessoa = { id: string; name: string };

/**
 * The tasks of the items someone took in a meeting (the minutes automation created them): open
 * ones with their due date, done ones closed on the day they were done. Links each item to its task.
 */
export function tarefasDosCombinados(combinados: CombinadoBase[], who: (name: string) => Pessoa | null, dono: string): TaskSummary[] {
  return combinados
    .filter((c) => c.responsavel)
    .map((c) => {
      const id = crypto.randomUUID();
      c.tarefaId = id;
      const nome = c.responsavel === "DONO" ? dono : c.responsavel!;
      const createdAt = new Date(`${c.data}T12:00:00`).toISOString();
      const completedAt = c.feito ? new Date(`${c.feito[1]}T17:30:00`).toISOString() : null;
      return {
        id,
        title: `${c.texto} · ${c.apelido}`,
        description: `Combinado na ${lower(c.fonte)}, a pedido de ${c.pedidoPor}.`,
        assignee: who(nome),
        dueDate: c.feito ? c.feito[1] : diaUtil(c.prazo ?? 5),
        status: c.feito ? ("DONE" as const) : ("OPEN" as const),
        createdAt,
        updatedAt: completedAt ?? createdAt,
        completedAt,
      };
    });
}

/** First letter in lower case, unless the word is an acronym ("CD de Ponta Grossa"). */
export const lower = (s: string) => (/^[A-ZÀ-Ú]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ---- reads ------------------------------------------------------------------------------------------

/** What the store holds, as the computations below read it (the mock db passes itself). */
export interface ConsultoriaState {
  clientes: Cliente[];
  projetos: ProjetoBase[];
  reunioes: ReuniaoBase[];
  combinados: CombinadoBase[];
  entregaveis: EntregavelBase[];
  tasks: TaskSummary[];
}

const hoje = () => isoDay(0);

export const daysUntil = (iso: string) =>
  Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - new Date(`${hoje()}T12:00:00`).getTime()) / DAY);

/** An agreed item as people read it: its status comes from its task (done, open, late) or the lack of one. */
export function combinadoView(state: ConsultoriaState, c: CombinadoBase): Combinado {
  const task = c.tarefaId ? state.tasks.find((t) => t.id === c.tarefaId) : undefined;
  const base = {
    id: c.id,
    reuniaoId: c.reuniaoId,
    projetoId: c.projetoId,
    apelido: c.apelido,
    texto: c.texto,
    pedidoPor: c.pedidoPor,
    trecho: c.trecho,
    minuto: c.minuto,
    impacto: c.impacto,
    sugerido: c.sugerido,
    prazoSugerido: c.prazoSugerido,
    fonte: c.fonte,
  };
  if (!task) return { ...base, status: "SEM_RESPONSAVEL", responsavel: null, tarefaId: null, prazo: null, feito: null, feitoEm: null };
  const responsavel = task.assignee?.name ?? null;
  if (task.status === "DONE") {
    return {
      ...base,
      status: "FEITO",
      responsavel,
      tarefaId: task.id,
      prazo: task.dueDate,
      feito: c.feito?.[0] ?? "Tarefa concluída",
      feitoEm: c.feito?.[1] ?? task.completedAt?.slice(0, 10) ?? null,
    };
  }
  const late = task.dueDate !== null && task.dueDate < hoje();
  return { ...base, status: late ? "ATRASADO" : "EM_ANDAMENTO", responsavel, tarefaId: task.id, prazo: task.dueDate, feito: null, feitoEm: null };
}

export function reuniaoView(state: ConsultoriaState, r: ReuniaoBase): Reuniao {
  const combinados = state.combinados.filter((c) => c.reuniaoId === r.id).map((c) => combinadoView(state, c));
  return {
    ...r,
    combinados,
    feitos: combinados.filter((c) => c.status === "FEITO").length,
    semResponsavel: combinados.filter((c) => c.status === "SEM_RESPONSAVEL").length,
  };
}

/** Meetings newest first. */
export const listReunioes = (state: ConsultoriaState) =>
  [...state.reunioes].sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora)).map((r) => reuniaoView(state, r));

function statusEntregavel(e: EntregavelBase): StatusEntregavel {
  if (e.feito === "ENTREGUE") return "ENTREGUE";
  if (e.feito === "APROVACAO") return "APROVACAO_CLIENTE";
  if (e.prazo < hoje()) return "ATRASADO";
  return e.feito === "ANDAMENTO" ? "EM_ANDAMENTO" : "NAO_INICIADO";
}

export const listEntregaveis = (state: ConsultoriaState): Entregavel[] =>
  state.entregaveis.map(({ feito, ...e }) => ({ ...e, status: statusEntregavel({ ...e, feito }) }));

const entregue = (e: Entregavel) => e.status === "ENTREGUE" || e.status === "APROVACAO_CLIENTE";

export function projetoView(state: ConsultoriaState, p: ProjetoBase): Projeto {
  const entregaveis = listEntregaveis(state).filter((e) => e.projetoId === p.id);
  const pendentes = entregaveis.filter((e) => !entregue(e)).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const reunioes = state.reunioes.filter((r) => r.projetoId === p.id).sort((a, b) => b.data.localeCompare(a.data));
  const combinados = state.combinados.filter((c) => c.projetoId === p.id).map((c) => combinadoView(state, c));
  const orfaos = combinados.filter((c) => c.status === "SEM_RESPONSAVEL");
  const semResponsavel = orfaos.length;
  // What nobody took comes first in the suggestion; it disappears once every item has an owner.
  const urgente = orfaos.find((c) => c.impacto) ?? orfaos[0];
  const dono = urgente
    ? `Dar dono ${semResponsavel === 1 ? "ao pedido sem responsável" : `aos ${semResponsavel} pedidos sem responsável`}, começando por ${lower(urgente.texto)}${urgente.impacto ? `: ${lower(urgente.impacto)}` : ""}. `
    : "";
  const atrasadas = pendentes.filter((e) => e.status === "ATRASADO").length;
  const avisos: TipoAviso[] = [];
  if (semResponsavel > 0) avisos.push("SEM_RESPONSAVEL");
  if (semContinuidade(p)) avisos.push("SEM_CONTINUIDADE");
  if (p.cobranca === "FIXO" && p.estouro >= 10) avisos.push("HORAS_ACIMA");
  if (atrasadas > 0) avisos.push("ENTREGA_ATRASADA");
  return {
    ...p,
    entregas: {
      total: entregaveis.length,
      entregues: entregaveis.filter(entregue).length,
      atrasadas,
      proxima: pendentes[0] ? { nome: pendentes[0].nome, prazo: pendentes[0].prazo } : null,
    },
    reunioes: reunioes.length,
    ultimaReuniao: reunioes[0]?.data ?? null,
    combinadosSemResponsavel: semResponsavel,
    acaoSugerida: dono + p.acaoSugerida,
    combinadosAbertos: combinados.filter((c) => c.status === "EM_ANDAMENTO" || c.status === "ATRASADO").length,
    avisos,
  };
}

export const listProjetos = (state: ConsultoriaState) => state.projetos.map((p) => projetoView(state, p));

/** Ends within the window, fixed fee, and nobody proposed what comes next. */
function semContinuidade(p: ProjetoBase) {
  return p.cobranca === "FIXO" && p.continuidade.status === "SEM_PROPOSTA" && daysUntil(p.fim) <= JANELA_CONTINUIDADE;
}

const origemDe = (r: ReuniaoBase) => `do ${ORIGEM_LABEL[r.origem]}`;

/**
 * The hero of the dashboard. Main: what was agreed in a meeting and became nobody's task, grouped
 * by meeting. Secondary: projects ending in the next 15 days with no continuity proposal.
 */
export function computeAvisos(state: ConsultoriaState): Avisos {
  const orfaos = state.combinados.map((c) => combinadoView(state, c)).filter((c) => c.status === "SEM_RESPONSAVEL");
  const grupos = [...new Set(orfaos.map((c) => c.reuniaoId))]
    .map((id) => {
      const base = state.reunioes.find((r) => r.id === id)!;
      const { feitos, semResponsavel } = reuniaoView(state, base);
      return { reuniao: { ...base, feitos, semResponsavel }, itens: orfaos.filter((c) => c.reuniaoId === id) };
    })
    .sort((a, b) => b.itens.length - a.itens.length || b.reuniao.data.localeCompare(a.reuniao.data));
  const origens = [...new Set(grupos.map((g) => origemDe(state.reunioes.find((r) => r.id === g.reuniao.id)!)))];
  const continuidade: AvisoContinuidade[] = state.projetos
    .filter(semContinuidade)
    .sort((a, b) => a.fim.localeCompare(b.fim))
    .map((p) => {
      const valorMensal = p.continuidade.valorMensal ?? 0;
      const ev = p.continuidade.evento;
      return {
        projetoId: p.id,
        projeto: p.nome,
        cliente: p.cliente,
        apelido: p.apelido,
        socio: p.socio,
        responsavel: p.responsavel,
        fim: p.fim,
        dias: daysUntil(p.fim),
        valor: p.valor,
        sugestao: p.continuidade.texto ?? "",
        valorMensal,
        valorAno: valorMensal * 12,
        evento: ev,
        cruzou: `Cruzou o fim do contrato + o Comercial (nenhuma proposta)${ev ? ` + ${ev.tipo === "EMAIL" ? `o e-mail de ${shortDay(ev.data)}` : `a reunião de ${shortDay(ev.data)}`}` : ""}`,
      };
    });
  return {
    combinados: {
      total: orfaos.length,
      reunioes: grupos.length,
      clientes: [...new Set(orfaos.map((c) => c.apelido))],
      grupos,
      cruzou: `Cruzou as transcrições ${origens.join(" e ")} + as tarefas do time + os projetos`,
    },
    continuidade: {
      janelaDias: JANELA_CONTINUIDADE,
      valorAno: continuidade.reduce((s, c) => s + c.valorAno, 0),
      projetos: continuidade,
    },
  };
}

/** Last full week, Monday to Friday. */
export function semanaPassada() {
  const segunda = -((new Date().getDay() + 6) % 7) - 7;
  return { inicio: isoDay(segunda), fim: isoDay(segunda + 4) };
}

/** Below this share of the 40h, the week counts as "falta lançar". */
const LIMITE_SEMANA = 0.8;

export function horasSemana(): HorasSemana[] {
  return EQUIPE.map((p) => {
    const projetos = (SEMANA[p.nome] ?? []).map(([apelido, horas]) => ({ apelido, horas }));
    return { nome: p.nome, cargo: p.cargo, nivel: p.nivel, lancadas: projetos.reduce((s, x) => s + x.horas, 0), esperadas: 40, projetos };
  }).sort((a, b) => a.lancadas / a.esperadas - b.lancadas / b.esperadas);
}

export const faltaLancar = (p: HorasSemana) => p.lancadas < p.esperadas * LIMITE_SEMANA;

export function computeHoras(state: ConsultoriaState): HorasView {
  const projetos: HorasProjeto[] = [...state.projetos]
    .sort((a, b) => b.estouro - a.estouro)
    .map((p) => ({
      projetoId: p.id,
      projeto: p.nome,
      cliente: p.cliente,
      apelido: p.apelido,
      frente: p.frente,
      cobranca: p.cobranca,
      responsavel: p.responsavel,
      horasOrcadas: p.horasOrcadas,
      horasLancadas: p.horasLancadas,
      horasProjetadas: p.horasProjetadas,
      concluido: p.concluido,
      consumido: Math.round((p.horasLancadas / p.horasOrcadas) * 100),
      estouro: p.estouro,
      horasAcima: p.horasAcima,
      margemAtual: p.margemAtual,
      margemPlanejada: p.margemPlanejada,
      causa: p.causas?.[0] ?? null,
    }));
  return { projetos, semana: { ...semanaPassada(), pessoas: horasSemana() } };
}

export function computeResumo(state: ConsultoriaState): ConsultoriaResumo {
  const projetos = listProjetos(state);
  const fixos = projetos.filter((p) => p.cobranca === "FIXO");
  const reunioes = listReunioes(state);
  const recentes = reunioes.filter((r) => daysUntil(r.data) >= -30);
  const avisos = computeAvisos(state);
  const entregaveis = listEntregaveis(state);
  const semana = horasSemana().filter(faltaLancar);
  const media = (pick: (p: Projeto) => number) => Math.round(projetos.reduce((s, p) => s + pick(p), 0) / projetos.length);
  const porFrente = Object.fromEntries(Object.keys(FRENTE_LABEL).map((f) => [f, projetos.filter((p) => p.frente === f).length])) as Record<Frente, number>;
  return {
    emAndamento: projetos.length,
    porFrente,
    valorEmCarteira: projetos.reduce((s, p) => s + (p.cobranca === "MENSAL" ? p.valor * 12 : p.valor), 0),
    semResponsavel: avisos.combinados.total,
    reunioesComPendencia: avisos.combinados.reunioes,
    clientesComPendencia: avisos.combinados.clientes.length,
    combinados30: recentes.reduce((s, r) => s + r.combinados.length, 0),
    reunioes30: recentes.length,
    feitos30: recentes.reduce((s, r) => s + r.feitos, 0),
    horasAcima: fixos.reduce((s, p) => s + p.horasAcima, 0),
    acimaDoOrcado: fixos.filter((p) => p.estouro >= 10).length,
    margemMedia: media((p) => p.margemAtual),
    margemPlanejadaMedia: media((p) => p.margemPlanejada),
    metaMargem: META_MARGEM,
    horasLancadas: fixos.reduce((s, p) => s + p.horasLancadas, 0),
    horasOrcadas: fixos.reduce((s, p) => s + p.horasOrcadas, 0),
    terminam15: projetos.filter((p) => p.cobranca === "FIXO" && daysUntil(p.fim) <= JANELA_CONTINUIDADE).length,
    semContinuidade: avisos.continuidade.projetos.length,
    renovacaoAno: avisos.continuidade.valorAno,
    terminam30: projetos.filter((p) => p.cobranca === "FIXO" && daysUntil(p.fim) <= 30).length,
    entregues30: entregaveis.filter((e) => entregue(e) && daysUntil(e.prazo) >= -30).length,
    proximas15: entregaveis.filter((e) => !entregue(e) && daysUntil(e.prazo) >= 0 && daysUntil(e.prazo) <= 15).length,
    atrasadas: entregaveis.filter((e) => e.status === "ATRASADO").length,
    aguardandoCliente: entregaveis.filter((e) => e.status === "APROVACAO_CLIENTE").length,
    pessoasSemLancar: semana.length,
    horasSemLancar: semana.reduce((s, p) => s + p.esperadas - p.lancadas, 0),
  };
}

// ---- writes -----------------------------------------------------------------------------------------

/**
 * Turns orphan items into tasks for the suggested owner and due date (the hero's button, the
 * meeting sheet and the assistant's approval card all land here). Returns the tasks created.
 */
export function combinadosParaTarefas(state: ConsultoriaState, ids: string[] | null, who: (name: string) => Pessoa | null): TaskSummary[] {
  const now = new Date().toISOString();
  const alvo = state.combinados.filter(
    (c) => (ids === null || ids.includes(c.id)) && combinadoView(state, c).status === "SEM_RESPONSAVEL",
  );
  return alvo.map((c) => {
    const task: TaskSummary = {
      id: crypto.randomUUID(),
      title: `${c.texto} · ${c.apelido}`,
      description: `Combinado na ${lower(c.fonte)}, a pedido de ${c.pedidoPor}.${c.impacto ? ` ${c.impacto}.` : ""}${c.trecho ? ` Na transcrição, aos ${c.minuto} min: “${c.trecho}”` : ""}`,
      assignee: who(c.sugerido),
      dueDate: c.prazoSugerido,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    state.tasks.unshift(task);
    c.tarefaId = task.id;
    c.responsavel = c.sugerido;
    return task;
  });
}

export { FASE_LABEL, FRENTE_LABEL };
