"use client";

import { useState } from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { api } from "@/core/api/client";
import type { Passkey, PasswordRequest } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { ErrorState, fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { formatDate, formatDateTime, formatRelative } from "@/core/ui/format";
import { isPasskeyCancelled, PASSKEYS_UNSUPPORTED, passkeysSupported, registerPasskey } from "./passkeys";
import { PasswordInput } from "./PasswordInput";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * Passkeys of the current account: list, add (password, then the browser's prompt) and remove.
 * `onRecoveryCodes` receives the codes when the passkey was the account's first factor; `withStepUp`
 * comes from the parent's `useStepUp()`, which renders the dialog.
 */
export function PasskeySettings({
  onRecoveryCodes,
  onChanged,
  withStepUp,
}: {
  onRecoveryCodes: (codes: string[]) => void;
  onChanged: () => Promise<void>;
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
}) {
  const { data: passkeys, error: loadError, refresh, retry } = useLoad((signal) => api<Passkey[]>("/api/me/passkeys", { signal }));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const [removePassword, setRemovePassword] = useState("");
  const supported = passkeysSupported();

  function closeForm() {
    setAdding(false);
    setLabel("");
    setPassword("");
    setError(null);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const codes = await registerPasskey(password, label.trim(), withStepUp);
      closeForm();
      notifySuccess("Chave de acesso adicionada");
      // As with the authenticator app, the session is re-read only when the codes are dismissed.
      if (codes.length) onRecoveryCodes(codes);
      await Promise.all([refresh(), onChanged()]);
    } catch (e) {
      if (!isPasskeyCancelled(e)) setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    const body: PasswordRequest = { currentPassword: removePassword };
    await withStepUp(() => api(`/api/me/passkeys/${encodeURIComponent(removing.id)}`, { method: "DELETE", body }));
    setRemovePassword("");
    notifySuccess("Chave de acesso removida");
    await Promise.all([refresh(), onChanged()]);
  }

  const passwordError = fieldError(error, "currentPassword");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h4 className="text-sm font-medium">Chaves de acesso</h4>
          <p className="text-sm text-muted-foreground">
            A digital, o rosto ou o PIN do dispositivo. Resistentes a phishing.
          </p>
        </div>
        {supported && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Adicionar chave de acesso
          </Button>
        )}
      </div>
      {!supported && <p className="text-sm text-muted-foreground">{PASSKEYS_UNSUPPORTED}</p>}
      {adding && (
        <form onSubmit={add}>
          <FieldGroup>
            <FormError error={passwordError ? null : error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="passkey-label">Nome</FieldLabel>
                <Input
                  id="passkey-label"
                  autoFocus
                  required
                  maxLength={64}
                  placeholder="Notebook"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              <Field data-invalid={!!passwordError}>
                <FieldLabel htmlFor="passkey-password">Senha atual</FieldLabel>
                <PasswordInput
                  id="passkey-password"
                  autoComplete="current-password"
                  required
                  aria-invalid={!!passwordError}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {passwordError && <FieldError>{passwordError}</FieldError>}
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !label.trim() || !password}>
                {busy ? <Spinner data-icon="inline-start" /> : <Fingerprint data-icon="inline-start" />}
                Continuar
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={closeForm}>
                Cancelar
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
      {loadError ? (
        <ErrorState error={loadError} onRetry={retry} className="p-6" />
      ) : !passkeys ? (
        <Skeleton className="h-14 w-full" />
      ) : passkeys.length === 0 ? (
        !adding && <p className="text-sm text-muted-foreground">Nenhuma chave de acesso cadastrada.</p>
      ) : (
        <ItemGroup className="gap-2">
          {passkeys.map((passkey) => (
            <Item key={passkey.id} variant="outline" size="sm">
              <ItemMedia variant="icon">
                <Fingerprint />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{passkey.label}</ItemTitle>
                <ItemDescription title={passkey.lastUsedAt ? formatDateTime(passkey.lastUsedAt) : undefined}>
                  Criada em {formatDate(passkey.createdAt)} · usada {passkey.lastUsedAt ? formatRelative(passkey.lastUsedAt) : "nunca"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remover ${passkey.label}`}
                  onClick={() => setRemoving(passkey)}
                >
                  <Trash2 />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setRemovePassword("");
          }
        }}
        title="Remover chave de acesso?"
        description={`“${removing?.label ?? ""}” deixa de servir para entrar. Confirme com a sua senha.`}
        confirmLabel="Remover"
        destructive
        onConfirm={remove}
      >
        <Field>
          <FieldLabel htmlFor="passkey-remove-password">Senha atual</FieldLabel>
          <PasswordInput
            id="passkey-remove-password"
            autoComplete="current-password"
            value={removePassword}
            onChange={(e) => setRemovePassword(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
