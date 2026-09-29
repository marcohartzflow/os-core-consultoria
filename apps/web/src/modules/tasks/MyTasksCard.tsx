"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { ErrorState, EmptyState } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { dueOf } from "./dates";
import { TaskDueDate } from "./TasksPage";
import type { TaskSummary } from "./types";

const ORDER = { overdue: 0, today: 1, tomorrow: 2, soon: 3, later: 4, none: 5, done: 6 } as const;

/** Dashboard card of the tasks example module: open tasks assigned to the viewer, overdue first. */
export function MyTasksCard({
  tasks,
  meId,
  error,
  onRetry,
}: {
  tasks: TaskSummary[] | null;
  meId: string;
  error: unknown;
  onRetry: () => void;
}) {
  const mine = (tasks ?? [])
    .filter((task) => task.status === "OPEN" && task.assignee?.id === meId)
    .sort((a, b) => ORDER[dueOf(a)] - ORDER[dueOf(b)] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Minhas tarefas</CardTitle>
        <CardDescription>
          {tasks ? `${mine.length} ${mine.length === 1 ? "aberta" : "abertas"} com você` : "Abertas com você"}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tasks">
              Tarefas
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="p-4" />
        ) : !tasks ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nada pendente" description="Nenhuma tarefa aberta com você." className="p-6" />
        ) : (
          <ItemGroup className="gap-2">
            {mine.slice(0, 5).map((task) => (
              <Item key={task.id} variant="outline" size="sm" asChild>
                <Link href="/tasks">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate">{task.title}</ItemTitle>
                    {task.description && <ItemDescription className="truncate">{task.description}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <TaskDueDate task={task} />
                  </ItemActions>
                </Link>
              </Item>
            ))}
            {mine.length > 5 && (
              <p className="text-center text-xs text-muted-foreground">e mais {mine.length - 5} na lista de tarefas</p>
            )}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
