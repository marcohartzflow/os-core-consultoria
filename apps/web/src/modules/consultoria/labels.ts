import type { Continuidade, Fase, FonteReuniao, Frente, StatusCombinado, StatusEntregavel, TipoAviso } from "./types";

export const FRENTE_LABEL: Record<Frente, string> = {
  GESTAO: "Gestão e processos",
  COMPLIANCE: "Compliance e LGPD",
  AMBIENTAL: "Meio ambiente",
  ESTRATEGIA: "Estratégia",
  PESSOAS: "Pessoas e organização",
};

export const FASE_LABEL: Record<Fase, string> = {
  DIAGNOSTICO: "Diagnóstico",
  DESENHO: "Desenho da solução",
  IMPLANTACAO: "Implantação",
  ENCERRAMENTO: "Encerramento",
  ACOMPANHAMENTO: "Acompanhamento mensal",
};

/** Order of the phases of a fixed-fee project, for the stepper. */
export const FASES: Fase[] = ["DIAGNOSTICO", "DESENHO", "IMPLANTACAO", "ENCERRAMENTO"];

export const COMBINADO_LABEL: Record<StatusCombinado, string> = {
  FEITO: "Feito",
  EM_ANDAMENTO: "Com responsável",
  ATRASADO: "Atrasado",
  SEM_RESPONSAVEL: "Sem responsável",
};

export const ENTREGAVEL_LABEL: Record<StatusEntregavel, string> = {
  ENTREGUE: "Entregue",
  APROVACAO_CLIENTE: "Com o cliente para aprovar",
  EM_ANDAMENTO: "Em andamento",
  ATRASADO: "Atrasado",
  NAO_INICIADO: "Não iniciado",
};

export const CONTINUIDADE_LABEL: Record<Continuidade, string> = {
  SEM_PROPOSTA: "Sem proposta",
  EM_CONVERSA: "Em conversa",
  PROPOSTA_ENVIADA: "Proposta enviada",
  RECORRENTE: "Contrato mensal",
  NAO_SE_APLICA: "Projeto pontual",
};

export const FONTE_LABEL: Record<FonteReuniao, string> = {
  MEET: "Google Meet",
  ZOOM: "Zoom",
};

export const AVISO_LABEL: Record<TipoAviso, string> = {
  SEM_RESPONSAVEL: "Combinado sem responsável",
  SEM_CONTINUIDADE: "Termina sem continuidade",
  HORAS_ACIMA: "Horas acima do orçado",
  ENTREGA_ATRASADA: "Entrega atrasada",
};
