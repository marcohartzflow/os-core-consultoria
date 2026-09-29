"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { api } from "@/core/api/client";
import { AuthHeading } from "@/core/auth/AuthHeading";
import { fieldError, FormError } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/iam/password-reset/request", { method: "POST", body: { email } });
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    // Same answer whether or not the address exists (account enumeration).
    return (
      <Empty className="p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailCheck />
          </EmptyMedia>
          <EmptyTitle>Confira seu e-mail</EmptyTitle>
          <EmptyDescription>
            Se existir uma conta ativa para {email}, enviamos um link para redefinir a senha. Ele vale por 1 hora.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link href="/login">
              <ArrowLeft data-icon="inline-start" />
              Voltar para o login
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const emailError = fieldError(error, "email");

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <AuthHeading title="Redefinir senha" description="Enviaremos um link para o e-mail cadastrado." />
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
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? "Enviando…" : "Enviar link"}
        </Button>
        <Link href="/login" className="block text-center text-xs text-muted-foreground hover:underline">
          Voltar para o login
        </Link>
      </FieldGroup>
    </form>
  );
}
