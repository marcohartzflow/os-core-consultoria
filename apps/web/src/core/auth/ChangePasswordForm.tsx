"use client";

import { useState } from "react";
import { api } from "@/core/api/client";
import { fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { useAuth } from "./AuthProvider";
import { PasswordInput } from "./PasswordInput";
import { useStepUp } from "./StepUp";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

/**
 * Change of the signed-in person's own password (current, new, confirmation), with step-up when the
 * second factor is old. Used by the Security settings and by the first-access onboarding.
 */
export function ChangePasswordForm({
  submitLabel = "Alterar senha",
  className,
}: {
  submitLabel?: string;
  className?: string;
}) {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const { withStepUp, stepUpDialog } = useStepUp();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      await withStepUp(() =>
        api("/api/me/password", {
          method: "POST",
          body: { currentPassword: current, newPassword: next },
        }),
      );
      setCurrent("");
      setNext("");
      setConfirm("");
      notifySuccess("Senha alterada", "Suas outras sessões foram encerradas.");
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const currentError = fieldError(error, "currentPassword");
  const nextError = fieldError(error, "newPassword");

  return (
    <>
      <form onSubmit={submit} className={className}>
        <FieldGroup>
          <FormError error={currentError || nextError ? null : error} />
          <Field data-invalid={!!currentError}>
            <FieldLabel htmlFor="current">Senha atual</FieldLabel>
            <PasswordInput
              id="current"
              autoComplete="current-password"
              required
              aria-invalid={!!currentError}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            {currentError && <FieldError>{currentError}</FieldError>}
          </Field>
          <Field data-invalid={!!nextError}>
            <FieldLabel htmlFor="next">Nova senha</FieldLabel>
            <PasswordInput
              id="next"
              autoComplete="new-password"
              required
              minLength={12}
              aria-invalid={!!nextError}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            {nextError ? (
              <FieldError>{nextError}</FieldError>
            ) : (
              <FieldDescription>Mínimo de 12 caracteres. Senhas vazadas são recusadas.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={mismatch}>
            <FieldLabel htmlFor="confirm">Confirmar nova senha</FieldLabel>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              required
              aria-invalid={mismatch}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setMismatch(false);
              }}
            />
            {mismatch && <FieldError>As senhas não conferem.</FieldError>}
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Salvando…" : submitLabel}
            </Button>
          </div>
        </FieldGroup>
      </form>
      {stepUpDialog}
    </>
  );
}
