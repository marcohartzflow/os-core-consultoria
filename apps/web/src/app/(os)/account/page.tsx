"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/core/api/client";
import type { SessionInfo } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { MfaCard } from "@/core/auth/MfaCard";
import { formatDateTime } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AccountPage() {
  const { me } = useAuth();
  // While a gate is active the API refuses everything but the gate's own calls; do not make them.
  const enrolling = me.mfa.required && !me.mfa.enabled;
  return (
    <>
      <PageHeader title="Minha conta" description={me.email} />
      {me.passwordChangeRequired && (
        <Alert className="mb-4">
          <AlertTitle>Defina uma nova senha para continuar</AlertTitle>
          <AlertDescription>
            A senha atual foi definida por outra pessoa. O restante do portal fica bloqueado até você escolher a sua.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {enrolling && (
          <Alert className="lg:col-span-2">
            <AlertTitle>Configure o segundo fator para continuar</AlertTitle>
            <AlertDescription>
              A sua conta exige um aplicativo autenticador. O restante do portal fica bloqueado até a configuração.
            </AlertDescription>
          </Alert>
        )}
        <ChangePasswordCard />
        {!me.passwordChangeRequired && <MfaCard />}
        {!me.passwordChangeRequired && !enrolling && <SessionsCard />}
        <Card>
          <CardHeader>
            <CardTitle>Meus dados</CardTitle>
            <CardDescription>Tudo que o portal guarda sobre você, em JSON (LGPD, art. 18).</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href="/api/me/data" download>
                Baixar meus dados
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ChangePasswordCard() {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setMessage({ kind: "error", text: "As senhas não conferem" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "ok", text: "Senha alterada. Suas outras sessões foram encerradas." });
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
        <CardTitle>Alterar senha</CardTitle>
        <CardDescription>Ao alterar, todas as outras sessões são encerradas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            {message && (
              <Alert variant={message.kind === "error" ? "destructive" : "default"}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="current">Senha atual</FieldLabel>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="next">Nova senha</FieldLabel>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <FieldDescription>Mínimo de 12 caracteres.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm">Confirmar nova senha</FieldLabel>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Alterar senha"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<SessionInfo[]>("/api/me/sessions").then(setSessions, (e: unknown) => setError(errorMessage(e))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function terminate(path: string) {
    setError(null);
    try {
      await api(path, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessões ativas</CardTitle>
        <CardDescription>Dispositivos conectados com a sua conta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Início</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  {formatDateTime(session.createdAt)} {session.current && <Badge variant="secondary">esta</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(session.lastAccessedAt)}</TableCell>
                <TableCell className="text-right">
                  {!session.current && (
                    <Button variant="ghost" size="sm" onClick={() => void terminate(`/api/me/sessions/${session.id}`)}>
                      Encerrar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sessions.some((s) => !s.current) && (
          <Button variant="outline" onClick={() => void terminate("/api/me/sessions")}>
            Encerrar todas as outras sessões
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
