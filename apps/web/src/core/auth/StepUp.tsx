"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { api, ApiError } from "@/core/api/client";
import type { MfaStatus } from "@/core/api/types";
import { isPasskeyCancelled, passkeysSupported, verifyWithPasskey } from "./passkeys";
import { fieldError, FormError } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** 403 the API answers when a sensitive action needs a second factor confirmed recently in this session. */
const REVERIFICATION_REQUIRED = "urn:os:problem:mfa-reverification-required";

interface StepUpRequest {
  resolve: () => void;
  reject: () => void;
}

/**
 * Step-up for sensitive actions: `withStepUp(fn)` runs `fn`; when the API asks for the second factor
 * again, it shows a dialog for a passkey or a code, confirms it (POST /api/auth/mfa or
 * /api/auth/mfa/passkey, which renew the session and the CSRF cookie) and runs `fn` once more. Cancelling rejects with the original 403. Render
 * `stepUpDialog` once in the component that uses the hook.
 */
export function useStepUp() {
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  // The request waiting on the dialog, so a newer one or an unmount can reject it: a caller (a
  // ConfirmDialog, say) must never stay busy on a promise nobody will settle.
  const pending = useRef<StepUpRequest | null>(null);

  useEffect(
    () => () => {
      pending.current?.reject();
      pending.current = null;
    },
    [],
  );

  const withStepUp = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 403 && e.type === REVERIFICATION_REQUIRED)) throw e;
      await new Promise<void>((resolve, reject) => {
        pending.current?.reject();
        const next = { resolve, reject: () => reject(e) };
        pending.current = next;
        setRequest(next);
      });
      return fn();
    }
  }, []);

  const stepUpDialog = (
    <StepUpDialog
      request={request}
      onSettled={(confirmed) => {
        if (confirmed) request?.resolve();
        else request?.reject();
        if (pending.current === request) pending.current = null;
        setRequest(null);
      }}
    />
  );

  return { withStepUp, stepUpDialog };
}

function StepUpDialog({
  request,
  onSettled,
}: {
  request: StepUpRequest | null;
  onSettled: (confirmed: boolean) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Whether the person has a passkey to offer; read each time the dialog opens.
  const [passkeys, setPasskeys] = useState(false);
  const open = request !== null;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api<MfaStatus>("/api/me/mfa", { signal: controller.signal }).then(
      (status) => setPasskeys(status.passkeys > 0 && passkeysSupported()),
      () => setPasskeys(false),
    );
    return () => controller.abort();
  }, [open]);

  function settle(confirmed: boolean) {
    setCode("");
    setError(null);
    setBusy(false);
    onSettled(confirmed);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/mfa", { method: "POST", body: { code: code.trim() } });
      settle(true);
    } catch (e) {
      // 401: too many failures ended the session; the shell is already on its way to the login.
      if (e instanceof ApiError && e.unauthorized) return settle(false);
      setError(e);
      setCode("");
      setBusy(false);
    }
  }

  async function confirmWithPasskey() {
    setBusy(true);
    setError(null);
    try {
      await verifyWithPasskey();
      settle(true);
    } catch (e) {
      if (e instanceof ApiError && e.unauthorized) return settle(false);
      if (!isPasskeyCancelled(e)) setError(e);
      setBusy(false);
    }
  }

  const codeError = fieldError(error, "code");

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !busy) settle(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Confirme o segundo fator</DialogTitle>
            <DialogDescription>
              Esta ação pede a verificação em duas etapas de novo.
              {passkeys ? " Use a chave de acesso ou digite um código." : " Digite o código do aplicativo autenticador."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <FormError error={codeError ? null : error} />
            {passkeys && (
              <>
                <Button type="button" disabled={busy} onClick={() => void confirmWithPasskey()}>
                  <Fingerprint data-icon="inline-start" />
                  Usar chave de acesso
                </Button>
                <FieldSeparator>ou</FieldSeparator>
              </>
            )}
            <Field data-invalid={!!codeError}>
              <FieldLabel htmlFor="step-up-code">Código</FieldLabel>
              <Input
                id="step-up-code"
                autoFocus={!passkeys}
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
                <FieldDescription>Sem o celular? Use um dos seus códigos de recuperação.</FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => settle(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant={passkeys ? "secondary" : "default"} disabled={busy || !code.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Verificando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
