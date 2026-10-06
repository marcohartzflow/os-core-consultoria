import { api, UserFacingError } from "@/core/api/client";
import type { PasswordRequest, RecoveryCodes } from "@/core/api/types";

// Passkeys through the browser's own WebAuthn JSON helpers (WebAuthn Level 3): the API sends and
// receives the standard JSON form, so no encoding library is needed.

export const PASSKEYS_UNSUPPORTED = "Este navegador não suporta chaves de acesso. Atualize-o ou use outro navegador.";

/** Whether this browser has WebAuthn with the JSON helpers (Chrome 129+, Safari 18.4+, Firefox 119+). */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.prototype.toJSON === "function"
  );
}

/** The person closed or cancelled the browser's prompt (or it timed out): nothing to report. */
export function isPasskeyCancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

function requireSupport() {
  if (!passkeysSupported()) throw new UserFacingError(PASSKEYS_UNSUPPORTED);
}

/**
 * Registers a new passkey; the recovery codes are non-empty only when it is the account's first factor.
 * `withStepUp` wraps both calls, so a person asked to confirm the second factor again does so before
 * the browser's prompt, or after it when the confirmation expired meanwhile.
 */
export async function registerPasskey(
  currentPassword: string,
  label: string,
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn(),
): Promise<string[]> {
  requireSupport();
  const body: PasswordRequest = { currentPassword };
  const options = await withStepUp(() =>
    api<PublicKeyCredentialCreationOptionsJSON>("/api/me/passkeys/options", { method: "POST", body }),
  );
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
  } catch (e) {
    // excludeCredentials matched: this authenticator already holds a passkey of the account.
    if (e instanceof DOMException && e.name === "InvalidStateError") {
      throw new UserFacingError("Este dispositivo já tem uma chave de acesso da sua conta.");
    }
    throw e;
  }
  if (!(credential instanceof PublicKeyCredential)) throw new UserFacingError("O navegador não criou a chave de acesso.");
  // The second call needs a recent second factor too: it may have expired during the browser's prompt.
  // A step-up here keeps the session's ceremony (the new session id carries its attributes).
  const result = await withStepUp(() =>
    api<RecoveryCodes>("/api/me/passkeys", {
      method: "POST",
      body: { publicKey: { label, credential: credential.toJSON() } },
    }),
  );
  return result.recoveryCodes;
}

/** Second factor with a passkey: login second step and step-up. Renews the session and the CSRF cookie. */
export async function verifyWithPasskey(): Promise<void> {
  requireSupport();
  const options = await api<PublicKeyCredentialRequestOptionsJSON>("/api/auth/mfa/passkey/options", { method: "POST" });
  const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) });
  if (!(credential instanceof PublicKeyCredential)) throw new UserFacingError("O navegador não devolveu a chave de acesso.");
  await api("/api/auth/mfa/passkey", { method: "POST", body: credential.toJSON() });
}
