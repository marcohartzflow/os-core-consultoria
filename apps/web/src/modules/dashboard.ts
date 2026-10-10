import type { ComponentType } from "react";
import {
  AvisosCard,
  HorasAcimaStat,
  HorasChart,
  ProjetosStat,
  RenovacaoStat,
  SemResponsavelStat,
} from "@/modules/consultoria/ConsultoriaDashboard";
import { MyTasksWidget } from "@/modules/tasks/TasksDashboard";

export interface DashboardWidget {
  /** Permission needed to see the widget; the API checks it again on every call. */
  permission: string;
  /** Indicator in the top row of the dashboard (a StatCard that loads its own data). */
  stat?: ComponentType;
  /**
   * Full-width block right below the indicators, the first thing the eye lands on. A dashboard with
   * a hero is the module's own: the portal's security and activity cards step aside.
   */
  hero?: ComponentType;
  /** Chart below the hero, two thirds wide beside the cards; replaces the portal activity chart. */
  chart?: ComponentType;
  /** Card beside the charts. */
  card?: ComponentType;
}

/**
 * Client modules add their indicators and cards to the dashboard here, the same way they add menu
 * entries in navigation.ts.
 */
export const moduleDashboard: DashboardWidget[] = [
  { permission: "consultoria.projeto.read", stat: ProjetosStat },
  { permission: "consultoria.reuniao.read", stat: SemResponsavelStat },
  { permission: "consultoria.horas.read", stat: HorasAcimaStat },
  { permission: "consultoria.aviso.read", stat: RenovacaoStat },
  { permission: "consultoria.aviso.read", hero: AvisosCard },
  { permission: "consultoria.horas.read", chart: HorasChart },
  { permission: "tasks.task.read", card: MyTasksWidget },
];
