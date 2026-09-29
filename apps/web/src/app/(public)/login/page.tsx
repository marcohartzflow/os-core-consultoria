"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthHeading } from "@/core/auth/AuthHeading";

/** Only same-origin paths: rejects protocol-relative (`//evil`) and backslash tricks (open redirect). */
function safeInternalPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return "/";
  }
  return candidate;
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Me>("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace(safeInternalPath(search.get("next")));
    } catch (e) {
      const message = errorMessage(e);
      setError(message === "Autenticação necessária" ? "E-mail ou senha inválidos" : message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <AuthHeading title="Entrar na sua conta" description="Informe seu e-mail e sua senha." />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="voce@empresa.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
        <div className="text-center text-xs">
          <Link href="/password-reset" className="text-muted-foreground hover:underline">
            Esqueci minha senha
          </Link>
        </div>
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
