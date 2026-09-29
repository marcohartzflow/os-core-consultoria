"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Search, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { AdministratorStatus, InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { AdministratorGrantConfirmation, grantsAdministrator, RolePicker } from "@/core/iam/RolePicker";
import { StatusBadge } from "@/core/iam/StatusBadge";
import { formatDateTime, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StatusFilter = "all" | "active" | "invited" | "disabled" | "locked" | "anonymized";

const STATUS_FILTERS: [StatusFilter, string][] = [
  ["all", "Todos"],
  ["active", "Ativos"],
  ["invited", "Convidados"],
  ["disabled", "Desativados"],
  ["locked", "Bloqueados"],
  ["anonymized", "Anonimizados"],
];

/** Same precedence as StatusBadge, so the filter matches the badge a row shows. */
function statusOf(user: UserSummary): Exclude<StatusFilter, "all"> {
  if (user.anonymizedAt) return "anonymized";
  if (user.locked) return "locked";
  return user.status === "ACTIVE" ? "active" : user.status === "INVITED" ? "invited" : "disabled";
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [administrators, setAdministrators] = useState<AdministratorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return (users ?? []).filter(
      (user) =>
        (status === "all" || statusOf(user) === status) &&
        (!needle ||
          user.name.toLocaleLowerCase("pt-BR").includes(needle) ||
          user.email.toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [users, search, status]);

  const load = useCallback(
    () =>
      Promise.all([
        api<UserSummary[]>("/api/iam/users"),
        api<AdministratorStatus>("/api/iam/users/administrators"),
      ]).then(
        ([u, a]) => {
          setUsers(u);
          setAdministrators(a);
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
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
      {administrators?.belowMinimum && (
        <Alert>
          <AlertTitle>
            {administrators.active} de {administrators.minimum} administradores ativos
          </AlertTitle>
          <AlertDescription>
            Promova mais uma pessoa de confiança a administrador. Com um só, perder essa conta deixa ninguém capaz de
            gerenciar acessos.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Contas</CardTitle>
          <CardDescription>Clique em um nome para editar dados, roles e acesso.</CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Buscar por nome ou e-mail"
                placeholder="Buscar por nome ou e-mail…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger aria-label="Filtrar por status">
                <span className="text-muted-foreground">Status:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  {STATUS_FILTERS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {!users ? (
            <Skeleton className="mx-(--card-spacing) h-48" />
          ) : (
            <Table className="**:data-[slot=table-cell]:px-(--card-spacing) **:data-[slot=table-head]:px-(--card-spacing)">
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último acesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback>{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="grid min-w-0 leading-tight">
                          <Link href={`/settings/users/${user.id}`} className="truncate font-medium hover:underline">
                            {user.name}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.roles.map((r) => r.name).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge user={user} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(user.lastLoginAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      {users.length === 0 ? "Nenhum usuário." : "Nenhum usuário com esses filtros."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {users && (
          <CardFooter className="border-t text-sm text-muted-foreground tabular-nums">
            {visible.length} de {users.length} usuários
          </CardFooter>
        )}
      </Card>
    </>
  );
}

function InviteDialog({ onInvited }: { onInvited: () => Promise<void> }) {
  const { hasPermission } = useAuth();
  // Inviting is delegable; giving the new account access (roles) is reserved to administrators.
  const mayAssignRoles = hasPermission("iam.user.roles.assign");
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<InvitationIssued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !mayAssignRoles) return;
    api<RoleSummary[]>("/api/iam/roles").then(setRoles).catch(() => setRoles([]));
  }, [open, mayAssignRoles]);

  const confirmGrant = grantsAdministrator(roles, new Set(), selected);

  function reset() {
    setEmail("");
    setName("");
    setSelected(new Set());
    setPassword("");
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
        body: {
          email,
          name,
          roleIds: mayAssignRoles ? [...selected] : [],
          currentPassword: confirmGrant ? password : null,
        },
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
                {result.invitationLink
                  ? "O envio de e-mail não está configurado: copie e entregue o link abaixo. Ele não será exibido de novo."
                  : "O link foi enviado por e-mail para a pessoa convidada."}
              </AlertDescription>
            </Alert>
            {result.invitationLink && (
              <div className="flex gap-2">
                <Input readOnly value={result.invitationLink} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar link"
                  onClick={() => void navigator.clipboard.writeText(result.invitationLink ?? "")}
                >
                  <Copy />
                </Button>
              </div>
            )}
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
              {mayAssignRoles ? (
                <>
                  <Field>
                    <FieldLabel>Roles</FieldLabel>
                    <RolePicker roles={roles} selected={selected} onChange={setSelected} />
                  </Field>
                  {confirmGrant && <AdministratorGrantConfirmation value={password} onChange={setPassword} />}
                </>
              ) : (
                <Alert>
                  <AlertDescription>
                    A pessoa entra sem acesso a nenhuma área. Um administrador atribui as roles depois.
                  </AlertDescription>
                </Alert>
              )}
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
