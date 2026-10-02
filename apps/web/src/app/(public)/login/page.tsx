"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, ApiError } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { AuthHeading } from "@/core/auth/AuthHeading";
import { PasswordInput } from "@/core/auth/PasswordInput";
import { fieldError, FormError } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Only same-origin paths (open redirect). The URL parser decides, not a prefix check: it drops tabs
 * and newlines, so `/%09/evil.com` would otherwise pass as a path and resolve to `//evil.com`.
 */
function safeInternalPath(candidate: string | null): string {
  if (!candidate?.startsWith("/") || /[\u0000-\u001F\u007F\\]/.test(candidate)) return "/";
  const url = new URL(candidate, window.location.origin);
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/";
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Someone with a live session who lands here (bookmark, back button) goes straight on. A dead
  // cookie answers 401 and the form simply stays.
  useEffect(() => {
    let current = true;
    api<Me>("/api/me").then(
      () => current && router.replace(safeInternalPath(search.get("next"))),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [router, search]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Me>("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace(safeInternalPath(search.get("next")));
    } catch (e) {
      // Never say which of the two was wrong (account enumeration).
      setError(
        e instanceof ApiError && e.status === 401
          ? new ApiError(401, "Não foi possível entrar", "E-mail ou senha inválidos")
          : e,
      );
      setBusy(false);
    }
  }

  const emailError = fieldError(error, "email");
  const passwordError = fieldError(error, "password");

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <AuthHeading title="Entrar na sua conta" description="Informe seu e-mail e sua senha." />
        <FormError error={error} />
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="voce@empresa.com"
            required
            aria-invalid={!!emailError}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailError && <FieldError>{emailError}</FieldError>}
        </Field>
        <Field data-invalid={!!passwordError}>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <Link
              href="/password-reset"
              className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            aria-invalid={!!passwordError}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {passwordError && <FieldError>{passwordError}</FieldError>}
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
