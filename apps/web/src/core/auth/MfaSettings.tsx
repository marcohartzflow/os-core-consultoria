"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, KeyRound, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { api, saveFile } from "@/core/api/client";
import type { MfaSetup, MfaSetupRequest, MfaStatus, PasswordRequest, RecoveryCodes as RecoveryCodesResponse } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { ErrorState, fieldError, FormError, notifyError, notifySuccess } from "@/core/ui/feedback";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { PasskeySettings } from "./PasskeySettings";
import { useStepUp } from "./StepUp";
import { PasswordInput } from "./PasswordInput";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/core/settings/SettingsSection";
import { useSettingsLock } from "@/core/settings/SettingsLock";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
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

/** Shown once after the first factor or a regeneration: each code signs in once without the second factor. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Guarde estes códigos de recuperação</AlertTitle>
      <AlertDescription>
        <p>Cada um vale uma vez, para entrar sem o celular ou a chave de acesso. Eles não aparecem de novo.</p>
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
            onClick={() => saveFile(new Blob([text + "\n"], { type: "text/plain" }), "codigos-de-recuperacao.txt")}
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

/**
 * Second factors of the current account: the authenticator app (enrol, confirm, remove when policy
 * allows), passkeys and the recovery codes.
 */
export function MfaSettings() {
  const { refresh: refreshMe } = useAuth();
  const { data: status, error: loadError, refresh, retry } = useLoad((signal) => api<MfaStatus>("/api/me/mfa", { signal }));
  const [setup, setSetup] = useState<(MfaSetup & { qr: string }) | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const { withStepUp, stepUpDialog } = useStepUp();
  // The codes are shown once: the settings window stays open on this section until they are saved.
  useSettingsLock(recovery ? "Guarde os códigos de recuperação e clique em “Já guardei”. Eles não aparecem de novo." : null);

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
      setRecovery(result.recoveryCodes);
      setSetup(null);
      setCode("");
      notifySuccess("Aplicativo autenticador ativado", "A partir do próximo acesso o portal pede o segundo fator.");
      // The session (useAuth) is re-read only when the codes are dismissed: on the enrolment gate the
      // new session unmounts this screen, and the codes would vanish before being saved.
      await refresh();
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
      await withStepUp(() => api("/api/me/mfa/disable", { method: "POST", body: { currentPassword: password } }));
      setPassword("");
      notifySuccess("Aplicativo autenticador removido");
      await refresh();
      await refreshMe();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    const body: PasswordRequest = { currentPassword: regeneratePassword };
    const result = await withStepUp(() => api<RecoveryCodesResponse>("/api/me/mfa/recovery-codes", { method: "POST", body }));
    setRegeneratePassword("");
    setRecovery(result.recoveryCodes);
    notifySuccess("Novos códigos de recuperação gerados", "Os anteriores deixaram de valer.");
    await refresh();
  }

  const codeError = fieldError(error, "code");
  const passwordError = fieldError(error, "currentPassword");

  return (
    <SettingsSection
      title="Verificação em duas etapas"
      description="Além da senha, um segundo fator a cada novo acesso: um aplicativo autenticador ou uma chave de acesso."
      action={
        status &&
        (status.enabled ? (
          <Badge variant="secondary">
            <ShieldCheck />
            Ativa
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <ShieldOff />
            Inativa
          </Badge>
        ))
      }
    >
      {recovery && (
        <RecoveryCodes
          codes={recovery}
          onDone={() => {
            setRecovery(null);
            void refreshMe();
          }}
        />
      )}
      {loadError ? (
        <ErrorState error={loadError} onRetry={retry} className="p-6" />
      ) : !status ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          {status.enabled && (
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <KeyRound />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Códigos de recuperação restantes</ItemTitle>
                <ItemDescription>
                  {status.recoveryCodesLeft > 2
                    ? "Cada código entra uma vez, sem o segundo fator."
                    : "Poucos códigos. Gere novos e guarde-os."}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={status.recoveryCodesLeft <= 2 ? "destructive" : "secondary"} className="tabular-nums">
                  {status.recoveryCodesLeft}
                </Badge>
                <Button size="sm" variant="outline" disabled={!!recovery} onClick={() => setRegenerating(true)}>
                  <RefreshCw data-icon="inline-start" />
                  Gerar novos
                </Button>
              </ItemActions>
            </Item>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h4 className="text-sm font-medium">Aplicativo autenticador</h4>
                <p className="text-sm text-muted-foreground">
                  Um código de 6 dígitos do Google Authenticator, Microsoft Authenticator ou 1Password.
                </p>
              </div>
              {status.totp && (
                <Badge variant="secondary">
                  <Smartphone />
                  Configurado
                </Badge>
              )}
            </div>
            {setup ? (
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
            ) : status.totp ? (
              // Policy: the app can go only while a passkey remains to be the required factor.
              (!status.required || status.passkeys > 0) && (
                <form onSubmit={disable}>
                  <FieldGroup>
                    <FieldDescription>
                      Para remover o aplicativo, confirme com a senha. Se a sua verificação tiver mais de 15 minutos, o código será pedido de novo.
                    </FieldDescription>
                    <FormError error={passwordError ? null : error} />
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
                    </div>
                    <div>
                      <Button type="submit" variant="destructive" disabled={busy}>
                        {busy && <Spinner data-icon="inline-start" />}
                        Remover aplicativo
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              )
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
                    <Button type="submit" variant={status.enabled ? "outline" : "default"} disabled={busy || !password}>
                      {busy ? <Spinner data-icon="inline-start" /> : <Smartphone data-icon="inline-start" />}
                      Configurar aplicativo
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            )}
          </div>
          <ConfirmDialog
            open={regenerating}
            onOpenChange={(open) => {
              setRegenerating(open);
              if (!open) setRegeneratePassword("");
            }}
            title="Gerar novos códigos de recuperação?"
            description="Os códigos atuais deixam de funcionar. Confirme com a sua senha."
            confirmLabel="Gerar novos códigos"
            onConfirm={regenerate}
          >
            <Field>
              <FieldLabel htmlFor="mfa-regenerate-password">Senha atual</FieldLabel>
              <PasswordInput
                id="mfa-regenerate-password"
                autoComplete="current-password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
              />
            </Field>
          </ConfirmDialog>
          <Separator />
          <PasskeySettings onRecoveryCodes={setRecovery} onChanged={refresh} withStepUp={withStepUp} />
          {status.required && (
            <p className="text-sm text-muted-foreground">
              A política da empresa exige a verificação em duas etapas: mantenha ao menos um fator.
            </p>
          )}
        </div>
      )}
      {stepUpDialog}
    </SettingsSection>
  );
}
