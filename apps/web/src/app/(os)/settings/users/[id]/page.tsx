"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { RolePicker } from "@/core/iam/RolePicker";
import { StatusBadge } from "@/core/iam/StatusBadge";
import { formatDateTime } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useAuth();
  const [user, setUser] = useState<UserSummary | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [invitation, setInvitation] = useState<InvitationIssued | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([
        api<UserSummary>(`/api/iam/users/${id}`),
        api<RoleSummary[]>("/api/iam/roles").catch(() => [] as RoleSummary[]),
      ]).then(([u, r]) => {
        setUser(u);
        setRoles(r);
        setName(u.name);
        setSelected(new Set(u.roles.map((role) => role.id)));
      }),
    [id],
  );

  useEffect(() => {
    load().catch((e: unknown) => setMessage({ kind: "error", text: errorMessage(e) }));
  }, [load]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage({ kind: "ok", text: label });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return message ? (
      <Alert variant="destructive">
        <AlertDescription>{message.text}</AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-64 w-full" />
    );
  }

  const isSelf = user.id === me.id;

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <Button variant="ghost" asChild>
            <Link href="/settings/users">
              <ArrowLeft />
              Usuários
            </Link>
          </Button>
        }
      />
      {message && (
        <Alert variant={message.kind === "error" ? "destructive" : "default"} className="mb-4">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      {invitation && (
        <Alert className="mb-4">
          <AlertTitle>Novo link de convite gerado</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={invitation.invitationLink} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar link"
                onClick={() => void navigator.clipboard.writeText(invitation.invitationLink)}
              >
                <Copy />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados e roles</CardTitle>
            <CardDescription>Permissões mudam na próxima requisição do usuário, sem novo login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run("Usuário atualizado", () =>
                  api(`/api/iam/users/${id}`, { method: "PATCH", body: { name, roleIds: [...selected] } }),
                );
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Nome</FieldLabel>
                  <Input id="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Roles</FieldLabel>
                  <RolePicker roles={roles} selected={selected} onChange={setSelected} />
                </Field>
                <RequirePermission permission="iam.user.update">
                  <div>
                    <Button type="submit" disabled={busy}>
                      Salvar
                    </Button>
                  </div>
                </RequirePermission>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conta</CardTitle>
            <CardDescription>
              <StatusBadge user={user} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-1 text-muted-foreground">
              <dt>Criado em</dt>
              <dd className="text-foreground">{formatDateTime(user.createdAt)}</dd>
              <dt>Último acesso</dt>
              <dd className="text-foreground">{formatDateTime(user.lastLoginAt)}</dd>
            </dl>
            <div className="flex flex-col gap-2">
              {user.status === "INVITED" && (
                <RequirePermission permission="iam.user.create">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run("Convite reenviado", async () =>
                        setInvitation(
                          await api<InvitationIssued>(`/api/iam/users/${id}/invitations`, { method: "POST" }),
                        ),
                      )
                    }
                  >
                    Reenviar convite
                  </Button>
                </RequirePermission>
              )}
              {user.status === "DISABLED" && !user.anonymizedAt && (
                <RequirePermission permission="iam.user.anonymize">
                  <AnonymizeDialog
                    disabled={busy}
                    onConfirm={() =>
                      run("Dados pessoais anonimizados.", () => api(`/api/iam/users/${id}/anonymize`, { method: "POST" }))
                    }
                  />
                </RequirePermission>
              )}
              <RequirePermission permission="iam.user.disable">
                {user.anonymizedAt ? null : user.status === "DISABLED" ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run("Usuário reativado", () => api(`/api/iam/users/${id}/enable`, { method: "POST" }))}
                  >
                    Reativar
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    disabled={busy || isSelf}
                    onClick={() =>
                      void run("Usuário desativado. Sessões encerradas.", () =>
                        api(`/api/iam/users/${id}/disable`, { method: "POST" }),
                      )
                    }
                  >
                    Desativar
                  </Button>
                )}
              </RequirePermission>
              {!isSelf && !user.anonymizedAt && (
                <RequirePermission permission="iam.user.mfa.reset">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run("Segundo fator redefinido. A pessoa configura de novo no próximo acesso.", () =>
                        api(`/api/iam/users/${id}/mfa/reset`, { method: "POST" }),
                      )
                    }
                  >
                    Redefinir segundo fator
                  </Button>
                </RequirePermission>
              )}
              <RequirePermission permission="auth.session.terminate">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run("Sessões encerradas", () => api(`/api/iam/users/${id}/sessions`, { method: "DELETE" }))
                  }
                >
                  Encerrar sessões
                </Button>
              </RequirePermission>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function AnonymizeDialog({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>
          Anonimizar dados
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonimizar dados pessoais</DialogTitle>
          <DialogDescription>
            E-mail, nome, credenciais e conversas com o assistente são apagados de forma irreversível. A trilha de
            auditoria mantém só o identificador interno. A conta não pode ser reativada depois.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            Anonimizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
