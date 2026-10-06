"use client";

import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { FormError } from "./feedback";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Asks before an action that is hard to undo. Stays open while the action runs and shows its
 * error in place; closes only when the action succeeded. Fields passed as `children` sit in a form:
 * Enter confirms, and `confirmDisabled` holds the button until they are filled.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const formId = useId();

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          {destructive && (
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <TriangleAlert />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children && (
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && !confirmDisabled) void confirm();
            }}
          >
            {children}
          </form>
        )}
        <FormError error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy || confirmDisabled}
            onClick={() => void confirm()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
