"use client";

import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { ptBR } from "react-day-picker/locale";
import { api } from "@/core/api/client";
import type { UserSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDay, isoDay, parseDay } from "./dates";
import type { TaskRequest, TaskSummary } from "./types";

const NONE = "none";

/** Creates a task (`task` null) or shows and edits one. Read-only without tasks.task.update. */
export function TaskDialog({
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
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
      notifySuccess(task ? "Tarefa atualizada" : "Tarefa criada", title);
      await onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  const titleError = fieldError(error, "title");
  const descriptionError = fieldError(error, "description");
  const dueError = fieldError(error, "dueDate");

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? (readOnly ? "Tarefa" : "Editar tarefa") : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {task
              ? `Criada em ${new Date(task.createdAt).toLocaleDateString("pt-BR")}.`
              : "Descreva o que precisa ser feito, por quem e até quando."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            <FormError error={error} />
            <Field data-invalid={!!titleError}>
              <FieldLabel htmlFor="task-title">Título</FieldLabel>
              <Input
                id="task-title"
                required
                maxLength={200}
                disabled={readOnly}
                placeholder="Ex.: Revisar contrato do fornecedor"
                aria-invalid={!!titleError}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {titleError && <FieldError>{titleError}</FieldError>}
            </Field>
            <Field data-invalid={!!descriptionError}>
              <FieldLabel htmlFor="task-description">Descrição</FieldLabel>
              <Textarea
                id="task-description"
                maxLength={2000}
                rows={3}
                disabled={readOnly}
                placeholder="Detalhes, links, critérios de pronto…"
                aria-invalid={!!descriptionError}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {descriptionError && <FieldError>{descriptionError}</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field data-invalid={!!dueError}>
                <FieldLabel htmlFor="task-due">Prazo</FieldLabel>
                <div className="flex gap-1">
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="task-due"
                        type="button"
                        variant="outline"
                        disabled={readOnly}
                        aria-invalid={!!dueError}
                        className="flex-1 justify-start font-normal data-[empty=true]:text-muted-foreground"
                        data-empty={!dueDate}
                      >
                        <CalendarIcon data-icon="inline-start" />
                        {dueDate ? formatDay(dueDate) : "Sem prazo"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={ptBR}
                        selected={dueDate ? parseDay(dueDate) : undefined}
                        defaultMonth={dueDate ? parseDay(dueDate) : undefined}
                        onSelect={(date) => {
                          setDueDate(date ? isoDay(date) : "");
                          setCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  {dueDate && !readOnly && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Remover prazo" onClick={() => setDueDate("")}>
                      <X />
                    </Button>
                  )}
                </div>
                {dueError && <FieldError>{dueError}</FieldError>}
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {readOnly ? "Fechar" : "Cancelar"}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Salvando…" : task ? "Salvar alterações" : "Criar tarefa"}
                </Button>
              )}
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
