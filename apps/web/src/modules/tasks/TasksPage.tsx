"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTable } from "@tanstack/react-table";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  ListTodo,
  Plus,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import type { UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import {
  DataTable,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableResetFilters,
  DataTableViewOptions,
  type FacetOption,
} from "@/core/ui/data-table/DataTable";
import { dataTableFeatures, type DataTableColumnDef } from "@/core/ui/data-table/features";
import { EmptyState, ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, dueOf, formatDay, isoDay } from "./dates";
import { TaskActions } from "./TaskActions";
import { TaskDialog } from "./TaskDialog";
import type { TaskSummary } from "./types";

const NO_ASSIGNEE = "none";
const EMPTY_TASKS: TaskSummary[] = [];
const EMPTY_USERS: UserSummary[] = [];

const STATUS_OPTIONS: FacetOption[] = [
  { value: "OPEN", label: "Aberta", icon: CircleDashed },
  { value: "DONE", label: "Concluída", icon: CircleCheck },
];

const COLUMN_LABELS: Record<string, string> = {
  assignee: "Responsável",
  due: "Prazo",
  status: "Status",
  updatedAt: "Atualizada",
};

// Open tasks sort by due date, undated ones after them, done ones last.
const NO_DUE = Number.MAX_SAFE_INTEGER / 2;

function dueSortKey(task: TaskSummary): number {
  const base = task.dueDate ? new Date(`${task.dueDate}T00:00:00`).getTime() : NO_DUE;
  return task.status === "DONE" ? base + NO_DUE : base;
}

export function TaskStatusBadge({ task }: { task: Pick<TaskSummary, "status"> }) {
  return task.status === "DONE" ? (
    <Badge variant="secondary">
      <CircleCheck />
      Concluída
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleDashed />
      Aberta
    </Badge>
  );
}

/** Due date plus "Atrasada", "Hoje" or "Amanhã" while the task is open. */
export function TaskDueDate({ task }: { task: Pick<TaskSummary, "status" | "dueDate"> }) {
  if (!task.dueDate) return <span className="text-muted-foreground">Sem prazo</span>;
  const due = dueOf(task);
  return (
    <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
      <span className={due === "done" ? "text-muted-foreground" : undefined}>{formatDay(task.dueDate)}</span>
      {due === "overdue" && (
        <Badge variant="destructive">
          <TriangleAlert />
          Atrasada
        </Badge>
      )}
      {due === "today" && <Badge>Hoje</Badge>}
      {due === "tomorrow" && <Badge variant="secondary">Amanhã</Badge>}
    </div>
  );
}

function Assignee({ task }: { task: TaskSummary }) {
  if (!task.assignee) return <span className="text-muted-foreground">Sem responsável</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7">
        <AvatarFallback className="text-xs">{initials(task.assignee.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{task.assignee.name}</span>
    </div>
  );
}

export function TasksPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mayCreate = hasPermission("tasks.task.create");
  const mayListUsers = hasPermission("iam.user.read");
  // "Nova tarefa" in the sidebar's create menu lands here with ?nova and opens the dialog.
  // It may arrive while this page is already open, so react to the query, not only to the mount
  // (state adjusted during render, React's pattern for responding to a changed input).
  const requested = searchParams.has("nova");
  const [handled, setHandled] = useState(false);
  const [editing, setEditing] = useState<TaskSummary | "new" | null>(null);
  if (requested !== handled) {
    setHandled(requested);
    if (requested && mayCreate) setEditing("new");
  }

  useEffect(() => {
    if (searchParams.has("nova")) router.replace("/tasks");
  }, [searchParams, router]);

  const { data, error, refresh, retry } = useLoad(() =>
    Promise.all([
      api<TaskSummary[]>("/api/tasks"),
      mayListUsers ? api<UserSummary[]>("/api/iam/users") : Promise.resolve(EMPTY_USERS),
    ]),
  );
  const tasks = data?.[0] ?? null;
  const assignable = useMemo(
    () => (data?.[1] ?? EMPTY_USERS).filter((user) => user.status !== "DISABLED" && !user.anonymizedAt),
    [data],
  );

  const columns = useMemo<DataTableColumnDef<TaskSummary>[]>(
    () => [
      {
        id: "title",
        accessorFn: (task) => `${task.title} ${task.description ?? ""}`,
        filterFn: "includesString",
        sortFn: "text",
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tarefa" />,
        cell: ({ row }) => (
          <div className="grid max-w-md min-w-48 gap-0.5">
            <button
              type="button"
              className="truncate text-left font-medium hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row.original);
              }}
            >
              {row.original.title}
            </button>
            {row.original.description && (
              <span className="truncate text-xs text-muted-foreground">{row.original.description}</span>
            )}
          </div>
        ),
      },
      {
        id: "assignee",
        accessorFn: (task) => task.assignee?.id ?? NO_ASSIGNEE,
        filterFn: "arrIncludesSome",
        enableSorting: false,
        header: "Responsável",
        cell: ({ row }) => <Assignee task={row.original} />,
      },
      {
        id: "due",
        accessorFn: dueSortKey,
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Prazo" />,
        cell: ({ row }) => <TaskDueDate task={row.original} />,
      },
      {
        id: "status",
        accessorFn: (task) => task.status,
        filterFn: "arrIncludesSome",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <TaskStatusBadge task={row.original} />,
      },
      {
        id: "updatedAt",
        accessorFn: (task) => new Date(task.updatedAt).getTime(),
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Atualizada" />,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="whitespace-nowrap text-muted-foreground">{formatRelative(row.original.updatedAt)}</span>
            </TooltipTrigger>
            <TooltipContent>{formatDateTime(row.original.updatedAt)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <TaskActions task={row.original} onOpen={() => setEditing(row.original)} onChanged={refresh} />
          </div>
        ),
      },
    ],
    [refresh],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: tasks ?? EMPTY_TASKS,
    getRowId: (task) => task.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [{ id: "due", desc: false }],
    },
    autoResetPageIndex: false,
  });

  const search = (table.getColumn("title")?.getFilterValue() as string | undefined) ?? "";
  const assigneeOptions = useMemo<FacetOption[]>(() => {
    const names = new Map<string, string>();
    for (const task of tasks ?? []) if (task.assignee) names.set(task.assignee.id, task.assignee.name);
    return [
      ...[...names]
        .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
        .map(([value, label]) => ({ value, label, icon: UserRound })),
      { value: NO_ASSIGNEE, label: "Sem responsável" },
    ];
  }, [tasks]);

  const stats = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    const today = isoDay(now);
    const inAWeek = isoDay(addDays(now, 7));
    const monthAgo = addDays(now, -30).getTime();
    const open = tasks.filter((task) => task.status === "OPEN");
    return {
      open: open.length,
      unassigned: open.filter((task) => !task.assignee).length,
      overdue: open.filter((task) => dueOf(task, now) === "overdue").length,
      dueSoon: open.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= inAWeek).length,
      done: tasks.filter(
        (task) => task.status === "DONE" && task.completedAt && new Date(task.completedAt).getTime() >= monthAgo,
      ).length,
    };
  }, [tasks]);

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Módulo de exemplo: o mesmo caso de uso atende a tela e o assistente."
        actions={
          <RequirePermission permission="tasks.task.create">
            <Button onClick={() => setEditing("new")}>
              <Plus />
              Nova tarefa
            </Button>
          </RequirePermission>
        }
      />

      <StatGrid>
        <StatCard
          icon={ListTodo}
          label="Abertas"
          value={stats?.open ?? null}
          hint={stats && stats.unassigned > 0 ? `${stats.unassigned} sem responsável` : "Todas com responsável"}
        />
        <StatCard
          icon={TriangleAlert}
          label="Atrasadas"
          value={stats?.overdue ?? null}
          hint="Abertas com prazo vencido"
          badge={
            stats &&
            (stats.overdue > 0 ? <Badge variant="destructive">Atenção</Badge> : <Badge variant="secondary">Em dia</Badge>)
          }
        />
        <StatCard
          icon={CalendarClock}
          label="Vencem em 7 dias"
          value={stats?.dueSoon ?? null}
          hint="Abertas com prazo de hoje até a próxima semana"
        />
        <StatCard icon={CircleCheck} label="Concluídas" value={stats?.done ?? null} hint="Nos últimos 30 dias" />
      </StatGrid>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Lista de tarefas</CardTitle>
          <CardDescription>Clique em uma tarefa para ver ou editar. As com prazo mais próximo vêm primeiro.</CardDescription>
          <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-64">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Buscar tarefas"
                  placeholder="Buscar tarefas…"
                  value={search}
                  onChange={(e) => {
                    table.getColumn("title")?.setFilterValue(e.target.value || undefined);
                    table.setPageIndex(0);
                  }}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={STATUS_OPTIONS} />
              <DataTableFacetedFilter
                column={table.getColumn("assignee")}
                title="Responsável"
                options={assigneeOptions}
              />
              <DataTableResetFilters table={table} />
            </div>
            <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !tasks ? (
            <TableSkeleton columns={5} />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma tarefa ainda"
              description="Crie a primeira tarefa aqui ou peça ao assistente, que segue as mesmas regras."
              action={
                mayCreate && (
                  <Button size="sm" onClick={() => setEditing("new")}>
                    <Plus data-icon="inline-start" />
                    Nova tarefa
                  </Button>
                )
              }
            />
          ) : (
            <DataTable
              table={table}
              onRowClick={(task) => setEditing(task)}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhuma tarefa encontrada"
                  description="Nenhuma tarefa atende à busca e aos filtros escolhidos."
                  action={
                    <Button variant="outline" size="sm" onClick={() => table.resetColumnFilters()}>
                      Limpar filtros
                    </Button>
                  }
                />
              }
            />
          )}
        </CardContent>
        {tasks && tasks.length > 0 && !error && (
          <CardFooter className="border-t">
            <DataTablePagination table={table} noun={["tarefa", "tarefas"]} />
          </CardFooter>
        )}
      </Card>

      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          users={assignable}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
