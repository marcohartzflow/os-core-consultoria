"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { ErrorState, EmptyState } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import type { Paged } from "@/core/api/types";
import { TaskDueDate } from "./TasksPage";
import type { TaskSummary } from "./types";

/**
 * Dashboard card of the tasks example module: the first open tasks assigned to the viewer (the
 * API sorts the nearest due date first) and how many there are in all.
 */
export function MyTasksCard({
  page,
  meId,
  error,
  onRetry,
}: {
  page: Paged<TaskSummary> | null;
  meId: string;
  error: unknown;
  onRetry: () => void;
}) {
  const mine = page?.content ?? [];
  const total = page?.page.totalElements ?? 0;
  const href = `/tasks?status=OPEN&assignee=${encodeURIComponent(meId)}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Minhas tarefas</CardTitle>
        <CardDescription>
          {page ? `${total} ${total === 1 ? "aberta" : "abertas"} com você` : "Abertas com você"}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href={href}>
              Tarefas
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="p-4" />
        ) : !page ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nada pendente" description="Nenhuma tarefa aberta com você." className="p-6" />
        ) : (
          <ItemGroup className="gap-2">
            {mine.map((task) => (
              <Item key={task.id} variant="outline" size="sm" asChild>
                <Link href={href}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full min-w-0"><span className="truncate">{task.title}</span></ItemTitle>
                    {task.description && <ItemDescription className="truncate">{task.description}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <TaskDueDate task={task} />
                  </ItemActions>
                </Link>
              </Item>
            ))}
            {total > mine.length && (
              <p className="text-center text-xs text-muted-foreground">e mais {total - mine.length} na lista de tarefas</p>
            )}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
