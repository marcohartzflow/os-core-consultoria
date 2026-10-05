"use client";

import { useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { api } from "@/core/api/client";
import type { MfaStatus, PasswordRequest, RecoveryCodes as RecoveryCodesResponse } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { ErrorState, fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { PasskeySettings } from "./PasskeySettings";
import { RecoveryCodes } from "./RecoveryCodes";
import { TotpEnrollment } from "./TotpEnrollment";
import { useStepUp } from "./StepUp";
import { PasswordInput } from "./PasswordInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/core/settings/SettingsSection";
import { useSettingsLock } from "@/core/settings/SettingsLock";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";


/**
 * Second factors of the current account: the authenticator app (enrol, confirm, remove when policy
 * allows), passkeys and the recovery codes.
 */
export function MfaSettings() {
  const { refresh: refreshMe } = useAuth();
  const { data: status, error: loadError, refresh, retry } = useLoad((signal) => api<MfaStatus>("/api/me/mfa", { signal }));
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const { withStepUp, stepUpDialog } = useStepUp();
  // The codes are shown once: the settings window stays open on this section until they are saved.
  useSettingsLock(recovery ? "Guarde os códigos de recuperação e clique em “Já guardei”. Eles não aparecem de novo." : null);

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
            {status.totp ? (
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
              <TotpEnrollment
                withStepUp={withStepUp}
                primary={!status.enabled}
                onEnrolled={async (codes) => {
                  setRecovery(codes);
                  // The session (useAuth) is re-read only when the codes are dismissed: on the enrolment gate the
                  // new session unmounts this screen, and the codes would vanish before being saved.
                  await refresh();
                }}
              />
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
            confirmDisabled={!regeneratePassword}
          >
            <Field>
              <FieldLabel htmlFor="mfa-regenerate-password">Senha atual</FieldLabel>
              <PasswordInput
                id="mfa-regenerate-password"
                autoFocus
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
