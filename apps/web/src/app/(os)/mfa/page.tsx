"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/core/api/client";
import { useAuth } from "@/core/auth/AuthProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Second step of the login: a code from the authenticator app or a recovery code. */
export default function MfaPage() {
  const router = useRouter();
  const { refresh, logout } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/mfa", { method: "POST", body: { code } });
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
      setCode("");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Segundo fator</CardTitle>
        <CardDescription>Digite o código do seu aplicativo autenticador.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="mfa-code">Código</FieldLabel>
              <Input
                id="mfa-code"
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={20}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <FieldDescription>Sem o celular? Use um dos seus códigos de recuperação.</FieldDescription>
            </Field>
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => void logout()}>
                Sair
              </Button>
              <Button type="submit" disabled={busy || !code.trim()}>
                {busy ? "Verificando…" : "Confirmar"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
