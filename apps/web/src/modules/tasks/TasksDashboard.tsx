"use client";

import { ListTodo } from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { StatCard } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { dueOf } from "./dates";
import { MyTasksCard } from "./MyTasksCard";
import type { TaskSummary } from "./types";

function useOpenTasks() {
  return useLoad(() => api<TaskSummary[]>("/api/tasks?status=OPEN"));
}

/** Indicator of the tasks example module on the dashboard. */
export function OpenTasksStat() {
  const tasks = useOpenTasks();
  const open = tasks.data;
  const overdue = open?.filter((task) => dueOf(task) === "overdue").length ?? 0;
  return (
    <StatCard
      icon={ListTodo}
      label="Tarefas abertas"
      value={tasks.error ? "—" : (open?.length ?? null)}
      badge={
        open && (overdue > 0 ? <Badge variant="destructive">{overdue} atrasadas</Badge> : <Badge variant="secondary">Em dia</Badge>)
      }
      hint={tasks.error ? "Não foi possível carregar" : "De toda a equipe"}
    />
  );
}

/** "Minhas tarefas" card of the tasks example module on the dashboard. */
export function MyTasksWidget() {
  const { me } = useAuth();
  const tasks = useOpenTasks();
  return <MyTasksCard tasks={tasks.data} meId={me.id} error={tasks.error} onRetry={tasks.retry} />;
}
