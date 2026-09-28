"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { RequirePermission } from "@/core/auth/AuthProvider";
import { RolePicker } from "@/core/iam/RolePicker";
import { StatusBadge } from "@/core/iam/StatusBadge";
import { formatDateTime } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function UsersPage() {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<UserSummary[]>("/api/iam/users").then(setUsers, (e: unknown) => setError(errorMessage(e))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o portal e com quais roles."
        actions={
          <RequirePermission permission="iam.user.create">
            <InviteDialog onInvited={load} />
          </RequirePermission>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!users ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Link href={`/settings/users/${user.id}`} className="font-medium hover:underline">
                    {user.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>{user.roles.map((r) => r.name).join(", ") || "—"}</TableCell>
                <TableCell>
                  <StatusBadge user={user} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(user.lastLoginAt)}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum usuário.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function InviteDialog({ onInvited }: { onInvited: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<InvitationIssued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<RoleSummary[]>("/api/iam/roles").then(setRoles).catch(() => setRoles([]));
  }, [open]);

  function reset() {
    setEmail("");
    setName("");
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const issued = await api<InvitationIssued>("/api/iam/users", {
        method: "POST",
        body: { email, name, roleIds: [...selected] },
      });
      setResult(issued);
      await onInvited();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            O convidado recebe um link para definir a senha. O link vale por 48 horas.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Convite criado para {result.user.email}</AlertTitle>
              <AlertDescription>
                Se o envio de e-mail não estiver configurado, copie e entregue o link abaixo. Ele não será exibido
                de novo.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Input readOnly value={result.invitationLink} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar link"
                onClick={() => void navigator.clipboard.writeText(result.invitationLink)}
              >
                <Copy />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="invite-name">Nome</FieldLabel>
                <Input id="invite-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-email">E-mail</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Roles</FieldLabel>
                <RolePicker roles={roles} selected={selected} onChange={setSelected} />
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? "Enviando…" : "Enviar convite"}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
