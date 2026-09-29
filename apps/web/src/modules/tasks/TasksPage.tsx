"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, RotateCcw } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { TaskRequest, TaskStatus, TaskSummary } from "./types";

const NONE = "none";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function TasksPage() {
  const { hasPermission } = useAuth();
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [filter, setFilter] = useState<TaskStatus | "ALL">("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaskSummary | "new" | null>(null);

  const load = useCallback(() => {
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    return Promise.all([
      api<TaskSummary[]>(`/api/tasks${query}`),
      hasPermission("iam.user.read") ? api<UserSummary[]>("/api/iam/users") : Promise.resolve([] as UserSummary[]),
    ]).then(
      ([t, u]) => {
        setTasks(t);
        setUsers(u.filter((user) => user.status !== "DISABLED"));
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  }, [filter, hasPermission]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition(task: TaskSummary, action: "complete" | "reopen") {
    setError(null);
    try {
      await api(`/api/tasks/${task.id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Lista</CardTitle>
          <CardDescription>Clique no título para ver ou editar.</CardDescription>
          <CardAction>
            <Select value={filter} onValueChange={(value) => setFilter(value as TaskStatus | "ALL")}>
              <SelectTrigger aria-label="Filtro de status">
                <span className="text-muted-foreground">Status:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="OPEN">Abertas</SelectItem>
                <SelectItem value="DONE">Concluídas</SelectItem>
                <SelectItem value="ALL">Todas</SelectItem>
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {!tasks ? (
            <Skeleton className="mx-(--card-spacing) h-48" />
          ) : tasks.length === 0 ? (
            <p className="px-(--card-spacing) py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa neste filtro.</p>
          ) : (
            <Table className="**:data-[slot=table-cell]:px-(--card-spacing) **:data-[slot=table-head]:px-(--card-spacing)">
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setEditing(task)}
                      >
                        {task.title}
                      </button>
                      {task.description && (
                        <span className="block max-w-md truncate text-xs text-muted-foreground">{task.description}</span>
                      )}
                    </TableCell>
                    <TableCell>{task.assignee?.name ?? "—"}</TableCell>
                    <TableCell>{formatDate(task.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant={task.status === "DONE" ? "secondary" : "outline"}>
                        {task.status === "DONE" ? "Concluída" : "Aberta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RequirePermission permission="tasks.task.update">
                        {task.status === "OPEN" ? (
                          <Button variant="ghost" size="sm" onClick={() => void transition(task, "complete")}>
                            <Check />
                            Concluir
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => void transition(task, "reopen")}>
                            <RotateCcw />
                            Reabrir
                          </Button>
                        )}
                      </RequirePermission>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function TaskDialog({
  task,
  users,
  onClose,
  onSaved,
}: {
  task: TaskSummary | null;
  users: UserSummary[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const readOnly = task ? !hasPermission("tasks.task.update") : false;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? NONE);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The assignee list needs iam.user.read; without it the current assignee is still shown as a fixed option.
  const options =
    task?.assignee && !users.some((u) => u.id === task.assignee?.id)
      ? [{ id: task.assignee.id, name: task.assignee.name }, ...users]
      : users;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: TaskRequest = {
      title,
      description: description || null,
      assigneeId: assigneeId === NONE ? null : assigneeId,
      dueDate: dueDate || null,
    };
    try {
      if (task) await api(`/api/tasks/${task.id}`, { method: "PUT", body });
      else await api("/api/tasks", { method: "POST", body });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? task.title : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {task ? `Criada em ${new Date(task.createdAt).toLocaleDateString("pt-BR")}.` : "O que precisa ser feito."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="task-title">Título</FieldLabel>
              <Input
                id="task-title"
                required
                maxLength={200}
                disabled={readOnly}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">Descrição</FieldLabel>
              <Textarea
                id="task-description"
                maxLength={2000}
                rows={3}
                disabled={readOnly}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-assignee">Responsável</FieldLabel>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={readOnly}>
                <SelectTrigger id="task-assignee" className="w-full">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {options.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-due">Prazo</FieldLabel>
              <Input
                id="task-due"
                type="date"
                disabled={readOnly}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <DialogFooter>
              {task && (
                <RequirePermission permission="tasks.task.delete">
                  <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
                    Excluir
                  </Button>
                </RequirePermission>
              )}
              {!readOnly && (
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </Button>
              )}
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
