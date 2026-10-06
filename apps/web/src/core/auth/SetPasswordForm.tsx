"use client";

import { useState } from "react";
import { api } from "@/core/api/client";
import { fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AuthHeading } from "./AuthHeading";
import { PasswordInput } from "./PasswordInput";

/** Shared by invitation acceptance and password reset confirmation. */
export function SetPasswordForm({
  endpoint,
  token,
  title,
  description,
  submitLabel,
  onDone,
}: {
  endpoint: string;
  token: string;
  title: string;
  description: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { method: "POST", body: { token, password } });
      notifySuccess("Senha definida", "Entre com o seu e-mail e a nova senha.");
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  const passwordError = fieldError(error, "password");

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <AuthHeading title={title} description={description} />
        <FormError error={error} />
        <Field data-invalid={!!passwordError}>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <PasswordInput
            id="password"
            autoFocus
            autoComplete="new-password"
            required
            minLength={12}
            aria-invalid={!!passwordError}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {passwordError ? (
            <FieldError>{passwordError}</FieldError>
          ) : (
            <FieldDescription>Mínimo de 12 caracteres. Senhas que apareceram em vazamentos são recusadas.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={mismatch}>
          <FieldLabel htmlFor="confirm">Confirmar senha</FieldLabel>
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
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? "Salvando…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
