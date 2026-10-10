// Data of the company screens (Comercial, Financeiro, Automações, Integrações) for the consultancy
// demo. This is the only niche-specific file of the empresa module: a fork for another market
// rewrites it and keeps the rest. Every company, person and number here is fictional. Days and
// minutes are relative to the request, so the demo always looks current; the ones tied to a client
// meeting are counted from the same weekday the meeting falls on (see ultimo() in consultoria.ts).
import { OWNER_NAME } from "@/core/brand";
import type {
  CorMarca,
  EtapaPipeline,
  Ferramenta,
  IaConectada,
  ModeloAutomacao,
  Origem,
  PassoAutomacao,
  ResultadoExecucao,
  SaudeAutomacao,
  TipoAtividade,
} from "@/modules/empresa/types";
import { ultimo } from "./consultoria";

const DONO = OWNER_NAME;
const HELENA = "Helena Duarte";
const MARCELO = "Marcelo Antunes";

/** Days since a client meeting on a weekday (1 = Monday), plus the days after it. */
const desde = (weekday: number, semanas: number, depois = 0) => Math.max(0, -ultimo(weekday, semanas) - depois);

/** Minutes since a weekday at a given hour, for the "last run" of the automations. */
const minutosDesde = (weekday: number, semanas: number, hora: number) => {
  const d = new Date();
  d.setDate(d.getDate() + ultimo(weekday, semanas));
  d.setHours(hora, 0, 0, 0);
  return Math.max(30, Math.round((Date.now() - d.getTime()) / 60_000));
};

// ---- Comercial ------------------------------------------------------------------------------------

/** [type, days ago, text, source] */
type RawAtividade = [TipoAtividade, number, string, string];

interface RawNegocio {
  id: string;
  empresa: string;
  contato: string;
  segmento: string;
  servico: string;
  valor: number;
  recorrente: boolean;
  etapa: string;
  responsavel: string;
  origem: Origem;
  diasNaEtapa: number;
  proximoPasso: string;
  probabilidade: number;
  atividades: RawAtividade[];
}

const ETAPAS: EtapaPipeline[] = [
  { key: "CONTATO", label: "Contato" },
  { key: "DIAGNOSTICO", label: "Diagnóstico" },
  { key: "PROPOSTA", label: "Proposta" },
  { key: "CONTRATO", label: "Contrato" },
];

export const COMERCIAL = {
  titulo: "Comercial",
  descricao:
    "Projetos novos e renovações, do primeiro contato ao contrato assinado. Renovação e fase 2 de cliente atual também passam por aqui. Arraste os cards entre as etapas.",
  etapas: ETAPAS,
  etapaGanha: "CONTRATO",
  etapasProposta: ["PROPOSTA"],
  diasParado: 10,
  conversao90: 31,
  conversao90Antes: 24,
  /** Values of the projects won in the last 90 days before the ones on the board. */
  ganhosAnteriores: [68_000, 76_000, 58_000],
  negocios: [
    {
      id: "n1",
      empresa: "Móveis Lunardi",
      contato: "Ivan Lunardi, diretor industrial",
      segmento: "Indústria de móveis planejados, 180 funcionários",
      servico: "Mapeamento de processos e custeio da fábrica",
      valor: 82_000,
      recorrente: false,
      etapa: "CONTRATO",
      responsavel: HELENA,
      origem: "Indicação",
      diasNaEtapa: 4,
      proximoPasso: "Kickoff na semana que vem",
      probabilidade: 100,
      atividades: [
        ["NOTA", 4, "Contrato assinado: 5 meses, 4 parcelas", "Gmail"],
        ["PROPOSTA", 12, "Proposta enviada: 320 horas em 3 fases", "Gmail"],
        ["REUNIAO", 19, "Diagnóstico: a fábrica não sabe o custo de cada pedido", "Google Meet"],
        ["EMAIL", 26, "Indicação da Metalúrgica Fornari", "Gmail"],
      ],
    },
    {
      id: "n2",
      empresa: "Laboratório Analítica Sul",
      contato: "Simone Ferraz, diretora técnica",
      segmento: "Laboratório de análises clínicas, 14 postos",
      servico: "Adequação à LGPD",
      valor: 54_000,
      recorrente: false,
      etapa: "CONTRATO",
      responsavel: MARCELO,
      origem: "Site",
      diasNaEtapa: 11,
      proximoPasso: "Inventário de dados começa em novembro",
      probabilidade: 100,
      atividades: [
        ["NOTA", 11, "Contrato assinado", "Gmail"],
        ["PROPOSTA", 20, "Proposta enviada: 240 horas", "Gmail"],
        ["REUNIAO", 27, "Diagnóstico com a diretora técnica e a TI", "Zoom"],
      ],
    },
    {
      id: "n3",
      empresa: "Metalúrgica Fornari",
      contato: "Priscila Fornari, diretora industrial",
      segmento: "Cliente atual: ISO 9001 termina este mês",
      servico: "Renovação: manutenção do sistema da qualidade e auditoria interna anual",
      valor: 4_200,
      recorrente: true,
      etapa: "PROPOSTA",
      responsavel: HELENA,
      origem: "Cliente atual",
      diasNaEtapa: desde(4, 1, 2),
      proximoPasso: "Confirmar com a Priscila antes da auditoria de certificação",
      probabilidade: 70,
      atividades: [
        ["PROPOSTA", desde(4, 1, 2), "Proposta de manutenção enviada: R$ 4.200/mês", "Gmail"],
        ["REUNIAO", desde(4, 1), "Priscila pediu a proposta para depois da certificação", "Google Meet"],
      ],
    },
    {
      id: "n4",
      empresa: "Distribuidora Ponte Alta",
      contato: "Sérgio Bittencourt, diretor de operações",
      segmento: "Cliente atual: redesenho de processos em andamento",
      servico: "Fase 2: implantação nos CDs de Ponta Grossa e Joinville",
      valor: 186_000,
      recorrente: false,
      etapa: "DIAGNOSTICO",
      responsavel: HELENA,
      origem: "Cliente atual",
      diasNaEtapa: desde(2, 0),
      proximoPasso: "Levar o comparativo de lead time dos 3 CDs ao comitê de diretoria",
      probabilidade: 60,
      atividades: [
        ["REUNIAO", desde(2, 0), "Renata: com o comparativo de lead time, a diretoria aprova a fase 2", "Google Meet"],
        ["REUNIAO", desde(2, 2), "Workshop: a implantação nos 3 CDs precisa de cronograma", "Zoom"],
      ],
    },
    {
      id: "n5",
      empresa: "Usina Solar Campos Gerais",
      contato: "Rodrigo Thomé, diretor de projetos",
      segmento: "Geração solar, 3 usinas em implantação",
      servico: "Licenciamento ambiental de 3 usinas solares",
      valor: 132_000,
      recorrente: false,
      etapa: "PROPOSTA",
      responsavel: MARCELO,
      origem: "Indicação",
      diasNaEtapa: 6,
      proximoPasso: "Apresentar a proposta à diretoria na terça",
      probabilidade: 55,
      atividades: [
        ["PROPOSTA", 6, "Proposta enviada: montada do modelo de licenciamento, 520 horas", "Gmail"],
        ["REUNIAO", 13, "Diagnóstico: as 3 usinas precisam de licença prévia até março", "Google Meet"],
        ["EMAIL", 18, "Indicação da Cerâmica Três Pinheiros", "Gmail"],
      ],
    },
    {
      id: "n6",
      empresa: "Vinícola Casa Bertolini",
      contato: "Giovana Bertolini, sócia",
      segmento: "Vinícola familiar, terceira geração",
      servico: "Planejamento estratégico e governança familiar",
      valor: 88_000,
      recorrente: false,
      etapa: "PROPOSTA",
      responsavel: HELENA,
      origem: "Evento",
      diasNaEtapa: 9,
      proximoPasso: "Responder às dúvidas sobre o conselho de família",
      probabilidade: 45,
      atividades: [
        ["EMAIL", 3, "Giovana perguntou como funciona o conselho de família", "Gmail"],
        ["PROPOSTA", 9, "Proposta enviada: 5 meses, 300 horas", "Gmail"],
        ["REUNIAO", 16, "Diagnóstico com os 3 irmãos sócios", "Zoom"],
      ],
    },
    {
      id: "n7",
      empresa: "Nortefarma Distribuidora",
      contato: "Alexandre Pinho, diretor jurídico",
      segmento: "Distribuidora de medicamentos, 2 estados",
      servico: "Programa de compliance e canal de denúncias",
      valor: 79_000,
      recorrente: false,
      etapa: "PROPOSTA",
      responsavel: MARCELO,
      origem: "LinkedIn",
      diasNaEtapa: 13,
      proximoPasso: "Cobrar retorno da proposta",
      probabilidade: 35,
      atividades: [
        ["EMAIL", 6, "Lembrete enviado, sem resposta", "Gmail"],
        ["PROPOSTA", 13, "Proposta enviada: 300 horas, 5 meses", "Gmail"],
        ["REUNIAO", 20, "Diagnóstico: exigência de compliance de um cliente hospitalar", "Google Meet"],
      ],
    },
    {
      id: "n8",
      empresa: "Transportes Serra Nevada",
      contato: "Cláudio Nunes, diretor de operações",
      segmento: "Transportadora frigorificada, 220 caminhões",
      servico: "Redesenho dos processos de operação e manutenção da frota",
      valor: 96_000,
      recorrente: false,
      etapa: "DIAGNOSTICO",
      responsavel: DONO,
      origem: "LinkedIn",
      diasNaEtapa: 5,
      proximoPasso: "Reunião de diagnóstico com a manutenção",
      probabilidade: 35,
      atividades: [
        ["REUNIAO", 5, "Primeira conversa: 18% da frota parada por manutenção corretiva", "Google Meet"],
        ["NOTA", 11, "Respondeu ao post sobre reunião que vira tarefa", "LinkedIn"],
      ],
    },
    {
      id: "n9",
      empresa: "Escola Técnica Futura",
      contato: "Marisa Okada, diretora",
      segmento: "Escola técnica, 2 campi",
      servico: "Plano de cargos e salários",
      valor: 52_000,
      recorrente: false,
      etapa: "DIAGNOSTICO",
      responsavel: HELENA,
      origem: "Site",
      diasNaEtapa: 8,
      proximoPasso: "Mandar o questionário de diagnóstico",
      probabilidade: 30,
      atividades: [
        ["REUNIAO", 8, "Diagnóstico: rotatividade alta nos coordenadores", "Google Meet"],
        ["NOTA", 12, "Formulário do site: plano de cargos", "Site"],
      ],
    },
    {
      id: "n10",
      empresa: "Shopping Pátio Verde",
      contato: "Fábio Moraes, superintendente",
      segmento: "Shopping center, 180 lojas",
      servico: "Renovação da licença de operação e plano de resíduos",
      valor: 46_000,
      recorrente: false,
      etapa: "DIAGNOSTICO",
      responsavel: MARCELO,
      origem: "Evento",
      diasNaEtapa: 3,
      proximoPasso: "Visita técnica ao shopping",
      probabilidade: 30,
      atividades: [["REUNIAO", 3, "Diagnóstico: licença de operação vence em fevereiro", "Zoom"]],
    },
    {
      id: "n11",
      empresa: "Frigorífico Vale Bonito",
      contato: "Daniela Kist, gerente de qualidade",
      segmento: "Frigorífico de suínos, exportação",
      servico: "Inventário de emissões para clientes do exterior",
      valor: 48_000,
      recorrente: false,
      etapa: "CONTATO",
      responsavel: MARCELO,
      origem: "LinkedIn",
      diasNaEtapa: 2,
      proximoPasso: "Agendar o diagnóstico",
      probabilidade: 15,
      atividades: [["NOTA", 2, "Pediu conversa depois do post sobre inventário de emissões", "LinkedIn"]],
    },
    {
      id: "n12",
      empresa: "Cooperativa de Crédito Integra Sul",
      contato: "Marcos Eller, diretor de riscos",
      segmento: "Cooperativa de crédito, 40 agências",
      servico: "Adequação à LGPD",
      valor: 70_000,
      recorrente: false,
      etapa: "CONTATO",
      responsavel: DONO,
      origem: "Site",
      diasNaEtapa: 6,
      proximoPasso: "Responder com a proposta de diagnóstico",
      probabilidade: 15,
      atividades: [["NOTA", 6, "Formulário do site: auditoria do Banco Central pediu evidências de LGPD", "Site"]],
    },
    {
      id: "n13",
      empresa: "Supermercados Vila Nova",
      contato: "Ronaldo Gaspar, diretor",
      segmento: "Rede de supermercados, 9 lojas",
      servico: "Padronização dos processos de loja",
      valor: 60_000,
      recorrente: false,
      etapa: "CONTATO",
      responsavel: HELENA,
      origem: "Evento",
      diasNaEtapa: 4,
      proximoPasso: "Ligar para o Ronaldo",
      probabilidade: 10,
      atividades: [["NOTA", 4, "Conversa no encontro de varejistas da região", "Evento"]],
    },
    {
      id: "n14",
      empresa: "Clínica Ortopédica Movimento",
      contato: "Dr. Caio Bastos, sócio",
      segmento: "Clínica de ortopedia, 2 unidades",
      servico: "Adequação à LGPD",
      valor: 38_000,
      recorrente: false,
      etapa: "CONTATO",
      responsavel: MARCELO,
      origem: "Indicação",
      diasNaEtapa: 1,
      proximoPasso: "Marcar a primeira conversa",
      probabilidade: 15,
      atividades: [["EMAIL", 1, "Indicação da Rede Vitalis de Clínicas", "Gmail"]],
    },
  ] satisfies RawNegocio[] as RawNegocio[],
};

// ---- Financeiro -----------------------------------------------------------------------------------

/** [name, category, description, due in days (negative = past), value, paid] */
export type RawLancamento = [string, string, string, number, number, boolean];

export const FINANCEIRO = {
  contas: [
    { id: "itau", banco: "Itaú", tipo: "Conta corrente", sigla: "IT", cor: "orange" as CorMarca, saldo: 186_400, sincronizadoMin: 5, variacao30: 22_480 },
    { id: "sicredi", banco: "Sicredi", tipo: "Conta PJ", sigla: "SI", cor: "green" as CorMarca, saldo: 48_200, sincronizadoMin: 14, variacao30: -3_140 },
    { id: "btg", banco: "BTG Pactual", tipo: "Investimentos", sigla: "BTG", cor: "blue" as CorMarca, saldo: 312_000, sincronizadoMin: 52, variacao30: 2_960 },
  ],
  /** Project instalments and the monthly retainer billed in the month. */
  receitaMes: 268_600,
  /** Operating expenses of the month. */
  categorias: [
    { categoria: "Folha e encargos", valor: 147_800 },
    { categoria: "Impostos", valor: 27_400 },
    { categoria: "Aluguel e escritório", valor: 14_800 },
    { categoria: "Viagens e visitas a clientes", valor: 9_600 },
    { categoria: "Sistemas e ferramentas", valor: 6_900 },
    { categoria: "Outros", valor: 6_100 },
    { categoria: "Treinamentos e certificações", valor: 4_800 },
  ],
  fluxoEntradas: [58_400, 71_200, 49_800, 66_300, 74_100, 52_600, 68_900, 61_400, 77_300, 55_200, 63_800, 70_500, 59_600],
  fluxoSaidas: [21_300, 18_700, 168_400, 24_100, 19_800, 22_600, 171_200, 20_400, 23_900, 18_100, 169_800, 21_700, 24_300],
  registrosSincronizadosMes: 9_840,
  pagar: [
    ["Folha de pagamento", "Folha e encargos", "Salários de outubro, 16 pessoas", 22, 112_600, false],
    ["INSS e FGTS", "Folha e encargos", "Encargos da folha de setembro", 11, 35_200, false],
    ["Condomínio Ed. Corporate Park", "Aluguel e escritório", "Aluguel e condomínio de outubro", -6, 14_800, true],
    ["Google Workspace", "Sistemas e ferramentas", "18 contas, plano Business", 7, 1_380, false],
    ["ClickUp", "Sistemas e ferramentas", "Plano Business, 18 usuários", 4, 1_040, false],
    ["Zoom", "Sistemas e ferramentas", "Licenças com transcrição", -3, 690, false],
    ["Anthropic", "Sistemas e ferramentas", "Claude, plano Team", 9, 1_650, false],
    ["Passagens e hospedagem", "Viagens e visitas a clientes", "Visitas técnicas em Criciúma e Chapecó", 3, 6_240, false],
    ["Locadora Sul Veículos", "Viagens e visitas a clientes", "Carro para as visitas de outubro", -2, 3_360, false],
    ["ISS e PIS/COFINS", "Impostos", "Impostos sobre o faturamento de setembro", 17, 27_400, false],
    ["Seguradora Atlântica", "Outros", "Seguro de responsabilidade profissional", -10, 2_900, true],
    ["Contabilidade Prisma", "Outros", "Serviço contábil de outubro", 5, 2_600, false],
    ["Instituto de Qualidade Sul", "Treinamentos e certificações", "Formação de auditor líder ISO 9001, 2 vagas", 12, 4_800, false],
  ] as RawLancamento[],
  receber: [
    ["Distribuidora Ponte Alta", "Parcela do projeto", "Redesenho de processos, parcela 4 de 6", -12, 24_600, true],
    ["Rede Vitalis de Clínicas", "Parcela do projeto", "Adequação à LGPD, parcela 3 de 4", -8, 23_000, true],
    ["Construtora Base Forte", "Contrato mensal", "Condicionantes de setembro", -9, 12_400, true],
    ["Hotéis Maré Alta", "Parcela do projeto", "Mapeamento de processos, parcela 3 de 4", -4, 16_000, false],
    ["Metalúrgica Fornari", "Parcela do projeto", "ISO 9001, parcela 5 de 6", -2, 12_000, true],
    ["Expresso Guaporé", "Parcela do projeto", "Programa de compliance, parcela 3 de 4", 3, 21_000, false],
    ["Cerâmica Três Pinheiros", "Marco do projeto", "Licenciamento, marco 3: protocolo da licença", 5, 29_500, false],
    ["Distribuidora Ponte Alta", "Parcela do projeto", "Redesenho de processos, parcela 5 de 6", 6, 24_600, false],
    ["Grupo Educacional Saber Mais", "Parcela do projeto", "Cargos e salários, parcela 2 de 4", 8, 17_000, false],
    ["Nuvia Pagamentos", "Parcela do projeto", "Adequação à LGPD, parcela 2 de 4", 10, 19_000, false],
    ["Móveis Lunardi", "Parcela do projeto", "Mapeamento de processos, parcela 1 de 4", 12, 20_500, false],
    ["Cooperativa Campo Firme", "Parcela do projeto", "Planejamento estratégico, parcela final", 14, 24_000, false],
    ["Metalúrgica Fornari", "Parcela do projeto", "ISO 9001, parcela final", 18, 12_000, false],
    ["Construtora Base Forte", "Contrato mensal", "Condicionantes de outubro", 21, 12_400, false],
    ["Agroindústria Bom Retiro", "Parcela do projeto", "Inventário de emissões, parcela 2 de 2", 28, 29_000, false],
  ] as RawLancamento[],
};

// ---- Automações -----------------------------------------------------------------------------------

interface RawAutomacao {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  passos: PassoAutomacao[];
  ativa: boolean;
  ultimaMin: number;
  execucoesMes: number;
  sucesso: number;
  horasMes: number;
  saude: SaudeAutomacao;
  aviso?: string;
}

export const AUTOMACOES: RawAutomacao[] = [
  {
    id: "ata-reuniao",
    nome: "Ata da reunião e tarefas criadas sozinhas",
    descricao:
      "Terminou a reunião, a transcrição do Meet ou do Zoom vira ata no Drive, cada combinado com dono vira tarefa e o que ficou sem dono aparece no painel.",
    categoria: "Reuniões",
    passos: [
      { icone: "calendario", texto: "Reunião com cliente termina", ferramenta: "Google Meet e Zoom" },
      { icone: "ia", texto: "Ler a transcrição e escrever a ata", ferramenta: "Claude" },
      { icone: "check", texto: "Criar tarefa para cada combinado com dono", ferramenta: "ClickUp" },
      { icone: "alerta", texto: "Avisar o que ficou sem responsável", ferramenta: "Portal" },
    ],
    ativa: true,
    ultimaMin: minutosDesde(4, 0, 11),
    execucoesMes: 46,
    sucesso: 100,
    horasMes: 23,
    saude: "OK",
  },
  {
    id: "status-semanal",
    nome: "Relatório de status semanal para o cliente",
    descricao: "Toda sexta, cada cliente recebe o que foi entregue, as horas da semana e os próximos passos. O gerente do projeto revisa antes de sair.",
    categoria: "Clientes",
    passos: [
      { icone: "calendario", texto: "Toda sexta às 16h" },
      { icone: "relatorio", texto: "Juntar entregas, horas e próximos passos", ferramenta: "Assistente" },
      { icone: "usuarios", texto: "Gerente revisa", ferramenta: "Portal" },
      { icone: "email", texto: "Enviar ao cliente", ferramenta: "Gmail" },
    ],
    ativa: true,
    ultimaMin: minutosDesde(5, 0, 16),
    execucoesMes: 40,
    sucesso: 100,
    horasMes: 20,
    saude: "OK",
  },
  {
    id: "lembrete-horas",
    nome: "Lembrete de lançar horas",
    descricao: "Sexta às 16h e segunda às 9h, quem lançou menos de 32h na semana recebe o lembrete com os projetos em que trabalhou.",
    categoria: "Horas",
    passos: [
      { icone: "relogio", texto: "Sexta 16h e segunda 9h" },
      { icone: "check", texto: "Comparar com 40h por pessoa", ferramenta: "Portal" },
      { icone: "email", texto: "Lembrar quem falta lançar", ferramenta: "Gmail" },
    ],
    ativa: true,
    ultimaMin: minutosDesde(1, 0, 9),
    execucoesMes: 8,
    sucesso: 100,
    horasMes: 6,
    saude: "OK",
  },
  {
    id: "proposta-modelo",
    nome: "Proposta montada a partir de um modelo",
    descricao: "Negócio que chega em Proposta ganha o documento pronto: escopo do diagnóstico, horas por fase e preço pela tabela, salvo no Drive para o sócio revisar.",
    categoria: "Comercial",
    passos: [
      { icone: "crm", texto: "Negócio entra em Proposta", ferramenta: "Comercial" },
      { icone: "ia", texto: "Preencher o modelo com escopo, horas e preço", ferramenta: "Claude" },
      { icone: "pasta", texto: "Salvar no Drive para revisão", ferramenta: "Google Drive" },
    ],
    ativa: true,
    ultimaMin: 6 * 24 * 60 + 140,
    execucoesMes: 7,
    sucesso: 100,
    horasMes: 21,
    saude: "OK",
  },
  {
    id: "sync-tarefas",
    nome: "Sincronizar tarefas com o ClickUp e o Trello",
    descricao: "Tarefas do portal, do ClickUp e dos quadros de cliente no Trello ficam iguais nos três lados, a cada 10 minutos.",
    categoria: "Dados",
    passos: [
      { icone: "relogio", texto: "A cada 10 minutos" },
      { icone: "sincronizar", texto: "Sincronizar tarefas", ferramenta: "ClickUp" },
      { icone: "sincronizar", texto: "Quadros de cliente", ferramenta: "Trello" },
    ],
    ativa: true,
    ultimaMin: 6,
    execucoesMes: 4_320,
    sucesso: 99.6,
    horasMes: 12,
    saude: "ATENCAO",
    aviso: "Quadro da Maré Alta no Trello sem permissão de escrita",
  },
  {
    id: "continuidade",
    nome: "Aviso de projeto terminando sem continuidade",
    descricao: "30 dias antes do fim de cada projeto, confere se há proposta no Comercial e avisa o sócio com o que o cliente já falou sobre o depois.",
    categoria: "Comercial",
    passos: [
      { icone: "calendario", texto: "30 dias antes do fim do projeto" },
      { icone: "crm", texto: "Procurar proposta no Comercial", ferramenta: "Comercial" },
      { icone: "alerta", texto: "Avisar o sócio", ferramenta: "Portal" },
    ],
    ativa: true,
    ultimaMin: 18 * 60 + 20,
    execucoesMes: 11,
    sucesso: 100,
    horasMes: 3,
    saude: "OK",
  },
];

/** [automation id, minutes ago, result, duration in seconds, detail] */
export const EXECUCOES: [string, number, ResultadoExecucao, number, string][] = [
  ["sync-tarefas", 6, "SUCESSO", 4, "214 tarefas sincronizadas"],
  ["sync-tarefas", 16, "FALHOU", 3, "Quadro da Maré Alta no Trello: sem permissão de escrita"],
  ["continuidade", 18 * 60 + 20, "SUCESSO", 9, "Campo Firme e Guaporé terminam sem proposta: aviso para Helena e Marcelo"],
  ["ata-reuniao", minutosDesde(4, 0, 11), "SUCESSO", 38, "Comitê de privacidade · Vitalis: ata no Drive, 2 tarefas, 1 combinado sem responsável"],
  ["ata-reuniao", minutosDesde(3, 0, 16), "SUCESSO", 31, "Revisão do manual operacional · Maré Alta: ata no Drive, 2 tarefas criadas"],
  ["ata-reuniao", minutosDesde(3, 0, 12), "SUCESSO", 27, "Condicionantes · Base Forte: ata no Drive, 2 tarefas criadas"],
  ["ata-reuniao", minutosDesde(2, 0, 15), "SUCESSO", 44, "Acompanhamento semanal · Ponte Alta: ata no Drive, 1 tarefa, 3 combinados sem responsável"],
  ["ata-reuniao", minutosDesde(1, 0, 16), "SUCESSO", 35, "Complementação do órgão ambiental · Três Pinheiros: 2 tarefas, 1 combinado sem responsável"],
  ["lembrete-horas", minutosDesde(1, 0, 9), "SUCESSO", 6, "Lembrete para Gustavo, Vinícius e Natália (56h a lançar)"],
  ["proposta-modelo", 6 * 24 * 60 + 140, "SUCESSO", 52, "Proposta da Usina Solar Campos Gerais salva no Drive"],
  ["status-semanal", minutosDesde(5, 0, 16), "APROVACAO", 61, "11 relatórios prontos, 10 enviados depois da revisão dos gerentes"],
];

export const MODELOS: ModeloAutomacao[] = [
  {
    nome: "Pasta e cronograma do projeto novo",
    descricao: "Contrato assinado cria a pasta no Drive, o projeto com as fases no ClickUp e agenda o kickoff com o cliente.",
    passos: [
      { icone: "check", texto: "Contrato assinado" },
      { icone: "pasta", texto: "Criar pasta no Drive" },
      { icone: "planilha", texto: "Fases no ClickUp" },
      { icone: "calendario", texto: "Agendar o kickoff" },
    ],
  },
  {
    nome: "Alerta de horas acima do orçado",
    descricao: "Projeto que passa de 80% das horas orçadas avisa o gerente com a projeção de término.",
    passos: [
      { icone: "relogio", texto: "80% das horas" },
      { icone: "ia", texto: "Projetar o fim" },
      { icone: "alerta", texto: "Avisar o gerente" },
    ],
  },
  {
    nome: "Pesquisa de satisfação no fim do projeto",
    descricao: "Entrega final aprovada dispara a pesquisa para o cliente e guarda a nota no projeto.",
    passos: [
      { icone: "check", texto: "Entrega final aprovada" },
      { icone: "email", texto: "Enviar a pesquisa" },
      { icone: "relatorio", texto: "Guardar a nota" },
    ],
  },
];

// ---- Integrações ----------------------------------------------------------------------------------

type RawFerramenta = Omit<Ferramenta, "sincronizadoEm"> & { sincronizadoMin: number | null };

export const FERRAMENTAS: RawFerramenta[] = [
  { id: "meet", nome: "Google Meet", categoria: "Reuniões e transcrição", sigla: "M", cor: "green", status: "CONECTADO", destaque: "Fonte das atas", sincronizadoMin: 4, uso: "Toda reunião com cliente transcrita, com ata no Drive", sincroniza: ["Transcrições", "Participantes", "Gravações"] },
  { id: "zoom", nome: "Zoom", categoria: "Reuniões e transcrição", sigla: "Z", cor: "blue", status: "CONECTADO", sincronizadoMin: 9, uso: "Reuniões dos clientes que preferem Zoom", sincroniza: ["Transcrições", "Participantes"] },
  { id: "drive", nome: "Google Drive", categoria: "Documentos e entregáveis", sigla: "D", cor: "yellow", status: "CONECTADO", sincronizadoMin: 11, uso: "1.380 documentos em 11 pastas de projeto", sincroniza: ["Atas", "Entregáveis", "Propostas"] },
  { id: "clickup", nome: "ClickUp", categoria: "Gerenciador de tarefas", sigla: "CU", cor: "violet", status: "CONECTADO", sincronizadoMin: 6, uso: "214 tarefas sincronizadas com o portal", sincroniza: ["Tarefas", "Responsáveis", "Prazos"] },
  { id: "trello", nome: "Trello", categoria: "Quadros de cliente", sigla: "T", cor: "sky", status: "CONECTADO", sincronizadoMin: 16, uso: "2 quadros de cliente; o da Maré Alta sem permissão de escrita", sincroniza: ["Cartões", "Prazos"] },
  { id: "gmail", nome: "Gmail", categoria: "E-mail", sigla: "M", cor: "red", status: "CONECTADO", sincronizadoMin: 2, uso: "2.940 e-mails com clientes lidos este mês", sincroniza: ["Clientes", "Propostas", "Relatórios de status"] },
  { id: "agenda", nome: "Google Agenda", categoria: "Agenda", sigla: "31", cor: "sky", status: "CONECTADO", sincronizadoMin: 8, uso: "Reuniões com cliente e visitas técnicas", sincroniza: ["Reuniões", "Visitas"] },
  { id: "itau", nome: "Itaú", categoria: "Banco da empresa", sigla: "IT", cor: "orange", status: "CONECTADO", sincronizadoMin: 5, uso: "214 transações conciliadas", sincroniza: ["Extrato", "Saldo", "Boletos"] },
  { id: "teams", nome: "Microsoft Teams", categoria: "Reuniões e transcrição", sigla: "T", cor: "indigo", status: "DISPONIVEL", sincronizadoMin: null, uso: "Transcrição das reuniões com clientes que usam Teams", sincroniza: ["Transcrições", "Participantes"] },
  { id: "slack", nome: "Slack", categoria: "Comunicação interna", sigla: "S", cor: "purple", status: "DISPONIVEL", sincronizadoMin: null, uso: "Avisos de combinado sem dono no canal de cada projeto", sincroniza: ["Canais", "Avisos"] },
  { id: "notion", nome: "Notion", categoria: "Base de conhecimento", sigla: "N", cor: "black", status: "DISPONIVEL", sincronizadoMin: null, uso: "Metodologias e modelos de entregáveis", sincroniza: ["Páginas", "Modelos"] },
  { id: "docusign", nome: "DocuSign", categoria: "Assinatura de contratos", sigla: "DS", cor: "amber", status: "DISPONIVEL", sincronizadoMin: null, uso: "Propostas e contratos assinados no portal", sincroniza: ["Contratos", "Aditivos"] },
];

export const IAS: IaConectada[] = [
  {
    id: "claude",
    nome: "Claude",
    fornecedor: "Anthropic",
    sigla: "C",
    cor: "orange",
    status: "CONECTADO",
    principal: true,
    modelo: "Claude Opus 5.5 e Sonnet 5.5",
    conversasMes: 1_120,
    horasMes: 142,
    tokensMes: 38_400_000,
    usuarios: [DONO, HELENA, MARCELO, "Camila Rezende", "Thiago Moreira", "Larissa Peixoto", "Rafael Cunha", "Beatriz Nogueira", "Gustavo Lemos"],
    usadoPara: "Assistente do portal, atas das reuniões, propostas e relatórios de status",
  },
  {
    id: "chatgpt",
    nome: "ChatGPT",
    fornecedor: "OpenAI",
    sigla: "AI",
    cor: "black",
    status: "CONECTADO",
    principal: false,
    modelo: "GPT-5",
    conversasMes: 236,
    horasMes: 18,
    tokensMes: 5_100_000,
    usuarios: ["Isabela Prado", "Natália Freitas", "Mariana Teles"],
    usadoPara: "Rascunhos de políticas e pesquisa de normas",
  },
  {
    id: "gemini",
    nome: "Gemini",
    fornecedor: "Google",
    sigla: "G",
    cor: "blue",
    status: "DISPONIVEL",
    principal: false,
    modelo: "Gemini Pro",
    conversasMes: 0,
    horasMes: 0,
    tokensMes: 0,
    usuarios: [],
    usadoPara: "Pode ler as planilhas e apresentações do Drive",
  },
];
