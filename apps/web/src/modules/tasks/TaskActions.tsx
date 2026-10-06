"use client";

import { useState } from "react";
import { Check, MoreHorizontal, PanelRightOpen, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/core/api/client";
import { useAuth } from "@/core/auth/AuthProvider";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskSummary } from "./types";

/** Completes or reopens a task and says so in a toast. */
export async function transitionTask(task: TaskSummary, onChanged: () => Promise<unknown> | void) {
  const complete = task.status === "OPEN";
  try {
    await api(`/api/tasks/${task.id}/${complete ? "complete" : "reopen"}`, { method: "POST" });
    notifySuccess(complete ? "Tarefa concluída" : "Tarefa reaberta", task.title);
    await onChanged();
  } catch (e) {
    notifyError(e, complete ? "Não foi possível concluir" : "Não foi possível reabrir");
  }
}

/** Row menu of a task. The API checks every permission again. */
export function TaskActions({
  task,
  onOpen,
  onChanged,
}: {
  task: TaskSummary;
  onOpen: () => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const { hasPermission } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Completing or reopening is running: the menu button spins and stays disabled, so it is not sent twice.
  const [working, setWorking] = useState(false);
  const mayUpdate = hasPermission("tasks.task.update");
  const mayDelete = hasPermission("tasks.task.delete");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Ações para ${task.title}`}
            aria-busy={working}
            disabled={working}
            onClick={(event) => event.stopPropagation()}
          >
            {working ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onOpen}>
              <PanelRightOpen />
              {mayUpdate ? "Abrir e editar" : "Abrir"}
            </DropdownMenuItem>
            {mayUpdate && (
              <DropdownMenuItem
                onSelect={() => {
                  setWorking(true);
                  void transitionTask(task, onChanged).finally(() => setWorking(false));
                }}
              >
                {task.status === "OPEN" ? <Check /> : <RotateCcw />}
                {task.status === "OPEN" ? "Concluir" : "Reabrir"}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {mayDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title="Excluir tarefa?"
        description={`"${task.title}" será excluída. A exclusão fica registrada na auditoria e não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          await api(`/api/tasks/${task.id}`, { method: "DELETE" });
          notifySuccess("Tarefa excluída", task.title);
          await onChanged();
        }}
      />
    </>
  );
}
