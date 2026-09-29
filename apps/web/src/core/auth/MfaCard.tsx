"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, errorMessage } from "@/core/api/client";
import type { MfaSetup, MfaStatus } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Enrol, confirm and (when policy allows) disable the second factor of the current account. */
export function MfaCard() {
  const { refresh } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<(MfaSetup & { qr: string }) | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<MfaStatus>("/api/me/mfa").then(setStatus, (e: unknown) => setMessage({ kind: "error", text: errorMessage(e) })),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function begin() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await api<MfaSetup>("/api/me/mfa/setup", { method: "POST" });
      const qr = await QRCode.toDataURL(created.otpauthUri, { margin: 1, width: 192 });
      setSetup({ ...created, qr });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { method: "POST", body: { code } });
      setRecovery(result.recoveryCodes);
      setSetup(null);
      setCode("");
      await load();
      await refresh();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/me/mfa/disable", { method: "POST", body: { currentPassword: password, code } });
      setPassword("");
      setCode("");
      setMessage({ kind: "ok", text: "Segundo fator desativado." });
      await load();
      await refresh();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Segundo fator
          {status && (
            <Badge variant={status.enabled ? "secondary" : "outline"}>{status.enabled ? "Ativo" : "Inativo"}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Código de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password) a cada
          novo acesso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
        {recovery && (
          <Alert>
            <AlertTitle>Guarde estes códigos de recuperação</AlertTitle>
            <AlertDescription>
              <p>Cada um vale uma vez, para entrar sem o celular. Eles não aparecem de novo.</p>
              <Textarea
                readOnly
                aria-label="Códigos de recuperação"
                className="mt-2 font-mono text-xs"
                value={recovery.join("\n")}
              />
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setRecovery(null)}>
                Já guardei
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!status ? null : setup ? (
          <form onSubmit={confirm}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated locally */}
                <img src={setup.qr} alt="QR code para o aplicativo autenticador" width={192} height={192} />
                <FieldDescription className="text-center">
                  Ou digite a chave manualmente: <span className="font-mono">{setup.secret}</span>
                </FieldDescription>
              </div>
              <Field>
                <FieldLabel htmlFor="mfa-confirm">Código gerado pelo aplicativo</FieldLabel>
                <Input
                  id="mfa-confirm"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Confirmando…" : "Ativar"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                  Cancelar
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : status.enabled ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Códigos de recuperação restantes: {status.recoveryCodesLeft}</p>
            {status.required ? (
              <p className="text-muted-foreground">A política da empresa exige o segundo fator para a sua conta.</p>
            ) : (
              <form onSubmit={disable}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="mfa-password">Senha atual</FieldLabel>
                    <Input
                      id="mfa-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mfa-disable-code">Código atual</FieldLabel>
                    <Input
                      id="mfa-disable-code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={20}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                  <div>
                    <Button type="submit" variant="destructive" disabled={busy}>
                      Desativar segundo fator
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            )}
          </div>
        ) : (
          <Button onClick={() => void begin()} disabled={busy}>
            Ativar segundo fator
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
