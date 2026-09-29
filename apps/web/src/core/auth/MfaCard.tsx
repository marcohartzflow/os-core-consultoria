"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { api } from "@/core/api/client";
import type { MfaSetup, MfaStatus } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { ErrorState, fieldError, FormError, notifyError, notifySuccess } from "@/core/ui/feedback";
import { PasswordInput } from "./PasswordInput";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <Item variant="muted" size="sm" className="items-start">
      <ItemMedia>
        <Badge variant="secondary" className="size-6 justify-center rounded-full p-0 tabular-nums">
          {n}
        </Badge>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {children}
      </ItemContent>
    </Item>
  );
}

/** Shown once after activation: each code signs in once without the phone. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Guarde estes códigos de recuperação</AlertTitle>
      <AlertDescription>
        <p>Cada um vale uma vez, para entrar sem o celular. Eles não aparecem de novo.</p>
        <Textarea readOnly aria-label="Códigos de recuperação" className="mt-2 font-mono text-xs" rows={codes.length} value={text} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(text).then(
                () => notifySuccess("Códigos copiados"),
                (e: unknown) => notifyError(e, "Não foi possível copiar"),
              )
            }
          >
            <Copy data-icon="inline-start" />
            Copiar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = "codigos-de-recuperacao.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download data-icon="inline-start" />
            Baixar .txt
          </Button>
          <Button size="sm" onClick={onDone}>
            Já guardei
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Enrol, confirm and (when policy allows) disable the second factor of the current account. */
export function MfaCard() {
  const { refresh: refreshMe } = useAuth();
  const { data: status, error: loadError, refresh, retry } = useLoad(() => api<MfaStatus>("/api/me/mfa"));
  const [setup, setSetup] = useState<(MfaSetup & { qr: string }) | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<MfaSetup>("/api/me/mfa/setup", { method: "POST" });
      const qr = await QRCode.toDataURL(created.otpauthUri, { margin: 1, width: 192 });
      setSetup({ ...created, qr });
    } catch (e) {
      notifyError(e, "Não foi possível iniciar a configuração");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { method: "POST", body: { code } });
      setRecovery(result.recoveryCodes);
      setSetup(null);
      setCode("");
      notifySuccess("Verificação em duas etapas ativada", "A partir do próximo acesso o portal pede o código.");
      await refresh();
      await refreshMe();
    } catch (e) {
      setError(e);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/mfa/disable", { method: "POST", body: { currentPassword: password, code } });
      setPassword("");
      setCode("");
      notifySuccess("Verificação em duas etapas desativada");
      await refresh();
      await refreshMe();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const codeError = fieldError(error, "code");
  const passwordError = fieldError(error, "currentPassword");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>
          Além da senha, um código de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator,
          1Password) a cada novo acesso.
        </CardDescription>
        {status && (
          <CardAction>
            {status.enabled ? (
              <Badge variant="secondary">
                <ShieldCheck />
                Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <ShieldOff />
                Inativa
              </Badge>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recovery && <RecoveryCodes codes={recovery} onDone={() => setRecovery(null)} />}
        {loadError ? (
          <ErrorState error={loadError} onRetry={retry} className="p-6" />
        ) : !status ? (
          <Skeleton className="h-24 w-full" />
        ) : setup ? (
          <form onSubmit={confirm}>
            <FieldGroup>
              <ItemGroup className="gap-2">
                <Step n={1} title="Instale um aplicativo autenticador">
                  <ItemDescription>Google Authenticator, Microsoft Authenticator ou 1Password.</ItemDescription>
                </Step>
                <Step n={2} title="Escaneie o QR code">
                  <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <Card size="sm" className="shrink-0 bg-background p-2 shadow-none">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated locally */}
                      <img src={setup.qr} alt="QR code para o aplicativo autenticador" width={160} height={160} />
                    </Card>
                    <ItemDescription>
                      Não consegue escanear? Digite a chave no aplicativo:
                      <span className="mt-1 block font-mono text-xs break-all text-foreground">{setup.secret}</span>
                    </ItemDescription>
                  </div>
                </Step>
                <Step n={3} title="Digite o código de 6 dígitos que o aplicativo mostra" />
              </ItemGroup>
              <FormError error={codeError ? null : error} />
              <Field data-invalid={!!codeError}>
                <FieldLabel htmlFor="mfa-confirm">Código do aplicativo</FieldLabel>
                <Input
                  id="mfa-confirm"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  required
                  className="max-w-40 font-mono tracking-widest"
                  aria-invalid={!!codeError}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                {codeError && <FieldError>{codeError}</FieldError>}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Confirmando…" : "Ativar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSetup(null);
                    setError(null);
                    setCode("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : status.enabled ? (
          <div className="flex flex-col gap-4">
            <ItemGroup className="gap-2">
              <Item variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <KeyRound />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Códigos de recuperação restantes</ItemTitle>
                  <ItemDescription>
                    {status.recoveryCodesLeft <= 2
                      ? "Poucos códigos. Desative e ative de novo para gerar outros."
                      : "Cada código entra uma vez, sem o celular."}
                  </ItemDescription>
                </ItemContent>
                <Badge variant={status.recoveryCodesLeft <= 2 ? "destructive" : "secondary"} className="tabular-nums">
                  {status.recoveryCodesLeft}
                </Badge>
              </Item>
            </ItemGroup>
            {status.required ? (
              <p className="text-sm text-muted-foreground">
                A política da empresa exige a verificação em duas etapas para a sua conta.
              </p>
            ) : (
              <>
                <Separator />
                <form onSubmit={disable}>
                  <FieldGroup>
                    <FieldDescription>
                      Para desativar, confirme com a senha e um código atual (ou de recuperação).
                    </FieldDescription>
                    <FormError error={codeError || passwordError ? null : error} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-invalid={!!passwordError}>
                        <FieldLabel htmlFor="mfa-password">Senha atual</FieldLabel>
                        <PasswordInput
                          id="mfa-password"
                          autoComplete="current-password"
                          required
                          aria-invalid={!!passwordError}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        {passwordError && <FieldError>{passwordError}</FieldError>}
                      </Field>
                      <Field data-invalid={!!codeError}>
                        <FieldLabel htmlFor="mfa-disable-code">Código</FieldLabel>
                        <Input
                          id="mfa-disable-code"
                          autoComplete="one-time-code"
                          required
                          maxLength={20}
                          className="font-mono"
                          aria-invalid={!!codeError}
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                        />
                        {codeError && <FieldError>{codeError}</FieldError>}
                      </Field>
                    </div>
                    <div>
                      <Button type="submit" variant="destructive" disabled={busy}>
                        {busy && <Spinner data-icon="inline-start" />}
                        Desativar duas etapas
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              </>
            )}
          </div>
        ) : (
          <Item variant="muted">
            <ItemMedia variant="icon">
              <Smartphone />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Proteja a conta mesmo se a senha vazar</ItemTitle>
              <ItemDescription>Leva um minuto: escaneie um QR code e digite um código.</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </CardContent>
      {status && !status.enabled && !setup && !loadError && (
        <CardFooter>
          <Button onClick={() => void begin()} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            Ativar duas etapas
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
