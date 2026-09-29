"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { api } from "@/core/api/client";
import { useAuth } from "@/core/auth/AuthProvider";
import { fieldError, FormError } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Second step of the login: a code from the authenticator app or a recovery code. */
export default function MfaPage() {
  const router = useRouter();
  const { me, refresh, logout } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/mfa", { method: "POST", body: { code: code.trim() } });
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e);
      setCode("");
      setBusy(false);
    }
  }

  const codeError = fieldError(error, "code");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <Empty className="p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
          </EmptyHeader>
        </Empty>
        <CardTitle className="text-xl">Verificação em duas etapas</CardTitle>
        <CardDescription>
          Abra o aplicativo autenticador e digite o código de {me.email}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FormError error={codeError ? null : error} />
            <Field data-invalid={!!codeError}>
              <FieldLabel htmlFor="mfa-code">Código</FieldLabel>
              <Input
                id="mfa-code"
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                maxLength={20}
                required
                className="text-center font-mono text-lg tracking-widest"
                aria-invalid={!!codeError}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              {codeError ? (
                <FieldError>{codeError}</FieldError>
              ) : (
                <FieldDescription>Sem o celular? Use um dos seus códigos de recuperação.</FieldDescription>
              )}
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Verificando…" : "Confirmar"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t">
        <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
          <LogOut data-icon="inline-start" />
          Sair e entrar com outra conta
        </Button>
      </CardFooter>
    </Card>
  );
}
