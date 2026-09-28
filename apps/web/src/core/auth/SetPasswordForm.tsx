"use client";

import { useState } from "react";
import { api, errorMessage } from "@/core/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Shared by invitation acceptance and password reset confirmation. */
export function SetPasswordForm({
  endpoint,
  token,
  title,
  submitLabel,
  onDone,
}: {
  endpoint: string;
  token: string;
  title: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("As senhas não conferem");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { method: "POST", body: { token, password } });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <h1 className="text-base font-semibold">{title}</h1>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>
            Mínimo de 12 caracteres. Senhas que apareceram em vazamentos são recusadas.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm">Confirmar senha</FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Salvando…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
