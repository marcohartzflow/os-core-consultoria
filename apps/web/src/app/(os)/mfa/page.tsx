"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, LogOut, ShieldCheck } from "lucide-react";
import { api } from "@/core/api/client";
import type { MfaStatus } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { isPasskeyCancelled, PASSKEYS_UNSUPPORTED, passkeysSupported, verifyWithPasskey } from "@/core/auth/passkeys";
import { fieldError, FormError } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** Second step of the login: a passkey, a code from the authenticator app or a recovery code. */
export default function MfaPage() {
  const router = useRouter();
  const { me, refresh, logout } = useAuth();
  // Which factors the account has. While it loads the fields wait (nothing jumps or steals focus);
  // if it fails, the code field alone is shown.
  const { data: status, error: statusError } = useLoad((signal) => api<MfaStatus>("/api/me/mfa", { signal }));
  const deciding = !status && !statusError;
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"code" | "passkey" | null>(null);
  const hasPasskeys = (status?.passkeys ?? 0) > 0;
  const supported = passkeysSupported();

  async function done() {
    await refresh();
    router.replace("/");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("code");
    setError(null);
    try {
      await api("/api/auth/mfa", { method: "POST", body: { code: code.trim() } });
      await done();
    } catch (e) {
      setError(e);
      setCode("");
      setBusy(null);
    }
  }

  async function signInWithPasskey() {
    setBusy("passkey");
    setError(null);
    try {
      await verifyWithPasskey();
      await done();
    } catch (e) {
      if (!isPasskeyCancelled(e)) setError(e);
      setBusy(null);
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
          {hasPasskeys
            ? `Confirme que é ${me.email} com a sua chave de acesso ou um código.`
            : `Abra o aplicativo autenticador e digite o código de ${me.email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FormError error={codeError ? null : error} />
          {deciding && (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}
          {!deciding && hasPasskeys && (
            <>
              <Field>
                <Button type="button" className="w-full" disabled={busy !== null || !supported} onClick={() => void signInWithPasskey()}>
                  {busy === "passkey" ? <Spinner data-icon="inline-start" /> : <Fingerprint data-icon="inline-start" />}
                  Usar chave de acesso
                </Button>
                {!supported && <FieldDescription className="text-center">{PASSKEYS_UNSUPPORTED}</FieldDescription>}
              </Field>
              <FieldSeparator>ou</FieldSeparator>
            </>
          )}
          {!deciding && (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field data-invalid={!!codeError}>
                  <FieldLabel htmlFor="mfa-code">Código</FieldLabel>
                  <Input
                    id="mfa-code"
                    autoFocus={!hasPasskeys}
                    autoComplete="one-time-code"
                    inputMode="text"
                    autoCapitalize="off"
                    spellCheck={false}
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
                    <FieldDescription>
                      {status && !status.totp
                        ? "Sem a chave de acesso? Use um dos seus códigos de recuperação."
                        : "Sem o celular? Use um dos seus códigos de recuperação."}
                    </FieldDescription>
                  )}
                </Field>
                <Button
                  type="submit"
                  variant={hasPasskeys ? "outline" : "default"}
                  className="w-full"
                  disabled={busy !== null || !code.trim()}
                >
                  {busy === "code" && <Spinner data-icon="inline-start" />}
                  {busy === "code" ? "Verificando…" : "Confirmar código"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </FieldGroup>
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
