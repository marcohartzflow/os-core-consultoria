import type { ComponentType } from "react";
import { MyTasksWidget, OpenTasksStat } from "@/modules/tasks/TasksDashboard";

export interface DashboardWidget {
  /** Permission needed to see the widget; the API checks it again on every call. */
  permission: string;
  /** Indicator in the top row of the dashboard (a StatCard that loads its own data). */
  stat?: ComponentType;
  /** Card in the second row. */
  card?: ComponentType;
}

/**
 * Client modules add their indicators and cards to the dashboard here, the same way they add menu
 * entries in navigation.ts. The tasks entry belongs to the example module and goes with it.
 */
export const moduleDashboard: DashboardWidget[] = [
  { permission: "tasks.task.read", stat: OpenTasksStat, card: MyTasksWidget },
];
