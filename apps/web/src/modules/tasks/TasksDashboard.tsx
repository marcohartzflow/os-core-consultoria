"use client";

import { ListTodo } from "lucide-react";
import { fetchPage, toQuery } from "@/core/api/query";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { StatCard } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { isoDay } from "./dates";
import { MyTasksCard } from "./MyTasksCard";
import type { TaskSummary } from "./types";

/** How many tasks match, read from the page total: the rows themselves are not needed. */
function count(params: Record<string, string>, signal: AbortSignal) {
  return fetchPage<TaskSummary>(`/api/tasks${toQuery({ ...params, size: 1 })}`, signal).then((page) => page.page.totalElements);
}

/** Indicator of the tasks example module on the dashboard. */
export function OpenTasksStat() {
  const counts = useLoad((signal) =>
    Promise.all([count({ status: "OPEN" }, signal), count({ status: "OPEN", dueBefore: isoDay(new Date()) }, signal)]),
  );
  const [open, overdue] = counts.data ?? [null, 0];
  return (
    <StatCard
      icon={ListTodo}
      label="Tarefas abertas"
      value={counts.error ? "—" : open}
      badge={
        counts.data &&
        (overdue > 0 ? <Badge variant="destructive">{overdue} atrasadas</Badge> : <Badge variant="secondary">Em dia</Badge>)
      }
      hint={counts.error ? "Não foi possível carregar" : "De toda a equipe"}
    />
  );
}

/** "Minhas tarefas" card of the tasks example module on the dashboard. */
export function MyTasksWidget() {
  const { me } = useAuth();
  const mine = useLoad((signal) =>
    fetchPage<TaskSummary>(`/api/tasks${toQuery({ status: "OPEN", assigneeId: me.id, size: 5 })}`, signal),
  );
  return <MyTasksCard page={mine.data} meId={me.id} error={mine.error} onRetry={mine.retry} />;
}
