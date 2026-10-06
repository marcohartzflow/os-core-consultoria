"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { api } from "@/core/api/client";
import type { MfaSetup, MfaSetupRequest } from "@/core/api/types";
import { fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { PasswordInput } from "./PasswordInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";

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

/**
 * Enrolment of an authenticator app: the password, then the QR code and the first 6-digit code.
 * `onEnrolled` receives the recovery codes the API returns with the first factor (empty otherwise);
 * `withStepUp` comes from the parent's `useStepUp()`, which renders the dialog.
 */
export function TotpEnrollment({
  withStepUp,
  onEnrolled,
  primary = true,
}: {
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  onEnrolled: (recoveryCodes: string[]) => Promise<void> | void;
  primary?: boolean;
}) {
  const [setup, setSetup] = useState<(MfaSetup & { qr: string }) | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: MfaSetupRequest = { currentPassword: password };
      const created = await withStepUp(() => api<MfaSetup>("/api/me/mfa/setup", { method: "POST", body }));
      setPassword("");
      const qr = await QRCode.toDataURL(created.otpauthUri, { margin: 1, width: 192 });
      setSetup({ ...created, qr });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await withStepUp(() =>
        api<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { method: "POST", body: { code } }),
      );
      setSetup(null);
      setCode("");
      notifySuccess("Aplicativo autenticador ativado", "A partir do próximo acesso o portal pede o segundo fator.");
      await onEnrolled(result.recoveryCodes);
    } catch (e) {
      setError(e);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const codeError = fieldError(error, "code");
  const passwordError = fieldError(error, "currentPassword");

  return setup ? (
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
              autoFocus
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
  ) : (
      <form onSubmit={begin}>
        <FieldGroup>
          <FormError error={passwordError ? null : error} />
          <Field data-invalid={!!passwordError} className="max-w-sm">
            <FieldLabel htmlFor="mfa-setup-password">Senha atual</FieldLabel>
            <PasswordInput
              id="mfa-setup-password"
              autoComplete="current-password"
              required
              aria-invalid={!!passwordError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordError ? (
              <FieldError>{passwordError}</FieldError>
            ) : (
              <FieldDescription>Para começar, confirme que é você.</FieldDescription>
            )}
          </Field>
          <div>
            <Button type="submit" variant={primary ? "default" : "outline"} disabled={busy || !password}>
              {busy ? <Spinner data-icon="inline-start" /> : <Smartphone data-icon="inline-start" />}
              Configurar aplicativo
            </Button>
          </div>
        </FieldGroup>
      </form>
  );
}
