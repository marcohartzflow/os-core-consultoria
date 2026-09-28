"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/core/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/iam/password-reset/request", { method: "POST", body: { email } });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <Alert>
          <AlertDescription>
            Se existir uma conta ativa para {email}, um link para redefinir a senha foi enviado. Ele vale por 1 hora.
          </AlertDescription>
        </Alert>
        <Link href="/login" className="block text-center text-muted-foreground hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <h1 className="text-base font-semibold">Redefinir senha</h1>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldDescription>Enviaremos um link para o e-mail cadastrado.</FieldDescription>
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Enviando…" : "Enviar link"}
        </Button>
        <Link href="/login" className="block text-center text-xs text-muted-foreground hover:underline">
          Voltar para o login
        </Link>
      </FieldGroup>
    </form>
  );
}
