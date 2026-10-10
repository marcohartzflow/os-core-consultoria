import type { Nivel } from "./types";

/** Cost of one hour of the team by level (salary, charges and overhead), BRL. */
export const CUSTO_HORA: Record<Nivel, number> = {
  Sócio: 260,
  Gerente: 185,
  Sênior: 145,
  Consultor: 110,
  Analista: 80,
};

/** People of the demo consultancy who log hours, seeded as users. The owner comes from brand.ts. */
export const EQUIPE: { nome: string; nivel: Nivel; cargo: string }[] = [
  { nome: "Helena Duarte", nivel: "Sócio", cargo: "Sócia de gestão e estratégia" },
  { nome: "Marcelo Antunes", nivel: "Sócio", cargo: "Sócio de compliance e meio ambiente" },
  { nome: "Camila Rezende", nivel: "Gerente", cargo: "Gerente de projetos de processos e qualidade" },
  { nome: "Thiago Moreira", nivel: "Gerente", cargo: "Gerente de projetos de compliance e LGPD" },
  { nome: "Larissa Peixoto", nivel: "Gerente", cargo: "Gerente de projetos ambientais" },
  { nome: "Rafael Cunha", nivel: "Sênior", cargo: "Consultor sênior de processos" },
  { nome: "Beatriz Nogueira", nivel: "Sênior", cargo: "Consultora sênior de licenciamento" },
  { nome: "Gustavo Lemos", nivel: "Sênior", cargo: "Consultor sênior de estratégia e pessoas" },
  { nome: "Isabela Prado", nivel: "Consultor", cargo: "Consultora de compliance e LGPD" },
  { nome: "Vinícius Rocha", nivel: "Consultor", cargo: "Consultor de processos" },
  { nome: "Natália Freitas", nivel: "Analista", cargo: "Analista ambiental" },
  { nome: "João Pedro Alves", nivel: "Analista", cargo: "Analista de projetos" },
  { nome: "Mariana Teles", nivel: "Analista", cargo: "Analista de compliance" },
];

/** Managers and leads in charge of the projects, for the list filters. */
export const RESPONSAVEIS = [
  "Camila Rezende",
  "Thiago Moreira",
  "Larissa Peixoto",
  "Rafael Cunha",
  "Gustavo Lemos",
] as const;
