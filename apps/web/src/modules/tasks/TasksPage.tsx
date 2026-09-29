"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Plus,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { DataTableCard, DataTableCardFooter, DataTableCardHeader } from "@/core/ui/data-table/DataTableCard";
import { fetchPage, toQuery } from "@/core/api/query";
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
import { type DataTableColumnDef } from "@/core/ui/data-table/features";
import { useServerTable } from "@/core/ui/data-table/useServerTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dueOf, formatDay } from "./dates";
import { TaskActions } from "./TaskActions";
import { TaskDialog } from "./TaskDialog";
import type { TaskSummary } from "./types";

const NO_ASSIGNEE = "none";
const FILTERS = ["status", "assignee"] as const;

const STATUS_OPTIONS: FacetOption[] = [
  { value: "OPEN", label: "Aberta", icon: CircleDashed },
  { value: "DONE", label: "Concluída", icon: CircleCheck },
];

const COLUMN_LABELS: Record<string, string> = {
  assignee: "Responsável",
  dueDate: "Prazo",
  status: "Status",
  updatedAt: "Atualizada",
};

/** The assignee facet mixes people with "no assignee"; the API takes them as two parameters. */
function toParams(filters: Record<string, string[]>) {
  const assignee = filters.assignee ?? [];
  return {
    status: filters.status,
    assigneeId: assignee.filter((value) => value !== NO_ASSIGNEE),
    unassigned: assignee.includes(NO_ASSIGNEE) || undefined,
  };
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
  const { me, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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

  // Drop ?nova once handled, keeping the table's own parameters (page, filters, search).
  useEffect(() => {
    if (!searchParams.has("nova")) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete("nova");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  // Assignee facet: the first active people by name (the facet is a shortcut, not a directory).
  const people = useLoad(() =>
    mayListUsers
      ? fetchPage<UserSummary>(`/api/iam/users${toQuery({ state: ["ACTIVE"], size: 100, sort: "name" })}`).then(
          (page) => page.content,
        )
      : Promise.resolve([] as UserSummary[]),
  );

  const columns = useMemo<DataTableColumnDef<TaskSummary>[]>(
    () => [
      {
        id: "title",
        accessorFn: (task) => task.title,
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
        enableSorting: false,
        header: "Responsável",
        cell: ({ row }) => <Assignee task={row.original} />,
      },
      {
        id: "dueDate",
        accessorFn: (task) => task.dueDate,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Prazo" />,
        cell: ({ row }) => <TaskDueDate task={row.original} />,
      },
      {
        id: "status",
        accessorFn: (task) => task.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <TaskStatusBadge task={row.original} />,
      },
      {
        id: "updatedAt",
        accessorFn: (task) => task.updatedAt,
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
            <TaskActions task={row.original} onOpen={() => setEditing(row.original)} onChanged={() => refreshRef()} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshRef is stable (declared below)
    [],
  );

  const list = useServerTable<TaskSummary>({
    sortable: ["title", "dueDate", "status", "updatedAt"],
    path: "/api/tasks",
    columns,
    filters: FILTERS,
    toParams,
    getRowId: (task) => task.id,
  });
  const { table, page, error, loading, retry, search, setSearch, filtered, clearFilters } = list;
  const refreshRef = list.refresh;

  const assigneeOptions = useMemo<FacetOption[]>(
    () => [
      { value: NO_ASSIGNEE, label: "Sem responsável" },
      { value: me.id, label: "Eu", icon: UserRound },
      ...(people.data ?? [])
        .filter((user) => user.id !== me.id)
        .map((user) => ({ value: user.id, label: user.name, icon: UserRound })),
    ],
    [people.data, me.id],
  );

  const total = page?.page.totalElements ?? 0;

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

      <DataTableCard>
        <DataTableCardHeader>
          <CardTitle className="text-xl leading-none">Lista de tarefas</CardTitle>
          <CardDescription>Clique em uma tarefa para ver ou editar. As abertas com prazo mais próximo vêm primeiro.</CardDescription>
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
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={STATUS_OPTIONS} />
              <DataTableFacetedFilter
                column={table.getColumn("assignee")}
                title="Responsável"
                options={assigneeOptions}
              />
              <DataTableResetFilters visible={filtered} onReset={clearFilters} />
            </div>
            <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
          </div>
        </DataTableCardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !page ? (
            <TableSkeleton columns={5} />
          ) : total === 0 && !filtered ? (
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
              loading={loading}
              onRowClick={(task) => setEditing(task)}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhuma tarefa encontrada"
                  description="Nenhuma tarefa atende à busca e aos filtros escolhidos."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  }
                />
              }
            />
          )}
        </CardContent>
        {page && total > 0 && !error && (
          <DataTableCardFooter>
            <DataTablePagination table={table} noun={["tarefa", "tarefas"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>

      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await list.refresh();
          }}
        />
      )}
    </>
  );
}
