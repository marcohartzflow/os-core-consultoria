"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTable } from "@tanstack/react-table";
import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  LayoutGrid,
  Lock,
  Rows3,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import type { AdministratorStatus, InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { AdministratorGrantConfirmation, grantsAdministrator, RolePicker } from "@/core/iam/RolePicker";
import { StatusBadge } from "@/core/iam/StatusBadge";
import { InvitationLinkDialog, UserActions } from "@/core/iam/UserActions";
import {
  DataTable,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableResetFilters,
  DataTableViewOptions,
  type FacetOption,
} from "@/core/ui/data-table/DataTable";
import { dataTableFeatures, type DataTableColumnDef } from "@/core/ui/data-table/features";
import { EmptyState, ErrorState, fieldError, FormError, notifySuccess, TableSkeleton } from "@/core/ui/feedback";
import { formatDate, formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type AccountState = "active" | "invited" | "disabled" | "locked" | "anonymized";

/** Same precedence as StatusBadge, so a filter matches the badge a row shows. */
function stateOf(user: UserSummary): AccountState {
  if (user.anonymizedAt) return "anonymized";
  if (user.locked) return "locked";
  return user.status === "ACTIVE" ? "active" : user.status === "INVITED" ? "invited" : "disabled";
}

const STATE_OPTIONS: FacetOption[] = [
  { value: "active", label: "Ativo", icon: CircleCheck },
  { value: "invited", label: "Convidado", icon: CircleDashed },
  { value: "locked", label: "Bloqueado", icon: Lock },
  { value: "disabled", label: "Desativado", icon: CircleSlash },
  { value: "anonymized", label: "Anonimizado", icon: UserX },
];

const MFA_OPTIONS: FacetOption[] = [
  { value: "on", label: "Ativa", icon: ShieldCheck },
  { value: "off", label: "Inativa", icon: ShieldAlert },
];

const COLUMN_LABELS: Record<string, string> = {
  roles: "Roles",
  state: "Status",
  mfa: "Duas etapas",
  lastLoginAt: "Último acesso",
  createdAt: "Criado em",
};

const EMPTY: UserSummary[] = [];

function Person({ user }: { user: UserSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 leading-tight">
        <Link
          href={`/settings/users/${user.id}`}
          className="truncate font-medium hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {user.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </div>
  );
}

function RoleBadges({ user }: { user: UserSummary }) {
  if (user.roles.length === 0) return <span className="text-muted-foreground">Sem roles</span>;
  const [first, ...rest] = [...user.roles].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline">{first.name}</Badge>
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary">+{rest.length}</Badge>
          </TooltipTrigger>
          <TooltipContent>{rest.map((role) => role.name).join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function MfaBadge({ user }: { user: UserSummary }) {
  return user.mfaEnabled ? (
    <Badge variant="secondary">
      <ShieldCheck />
      Ativa
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      <ShieldAlert />
      Inativa
    </Badge>
  );
}

function LastAccess({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-muted-foreground">Nunca</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="whitespace-nowrap">{formatRelative(iso)}</span>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(iso)}</TooltipContent>
    </Tooltip>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "grid">("list");
  const { data, error, refresh: load, retry } = useLoad(() =>
    Promise.all([
      api<UserSummary[]>("/api/iam/users"),
      api<AdministratorStatus>("/api/iam/users/administrators"),
    ]),
  );
  const users = data?.[0] ?? null;
  const administrators = data?.[1] ?? null;

  const columns = useMemo<DataTableColumnDef<UserSummary>[]>(
    () => [
      {
        id: "person",
        accessorFn: (user) => `${user.name} ${user.email}`,
        filterFn: "includesString",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pessoa" />,
        cell: ({ row }) => <Person user={row.original} />,
        enableHiding: false,
      },
      {
        id: "roles",
        accessorFn: (user) => user.roles.map((role) => role.name),
        filterFn: "arrIncludesSome",
        enableSorting: false,
        header: "Roles",
        cell: ({ row }) => <RoleBadges user={row.original} />,
      },
      {
        id: "state",
        accessorFn: stateOf,
        filterFn: "arrIncludesSome",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge user={row.original} />,
      },
      {
        id: "mfa",
        accessorFn: (user) => (user.mfaEnabled ? "on" : "off"),
        filterFn: "arrIncludesSome",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Duas etapas" />,
        cell: ({ row }) => <MfaBadge user={row.original} />,
      },
      {
        id: "lastLoginAt",
        accessorFn: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0),
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Último acesso" />,
        cell: ({ row }) => <LastAccess iso={row.original.lastLoginAt} />,
      },
      {
        id: "createdAt",
        accessorFn: (user) => new Date(user.createdAt).getTime(),
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Criado em" />,
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <UserActions user={row.original} onChanged={load} />
          </div>
        ),
      },
    ],
    [load],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: users ?? EMPTY,
    getRowId: (user) => user.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnVisibility: { createdAt: false },
      sorting: [{ id: "person", desc: false }],
    },
    autoResetPageIndex: false,
  });

  const search = (table.getColumn("person")?.getFilterValue() as string | undefined) ?? "";
  const roleOptions = useMemo<FacetOption[]>(
    () =>
      [...new Set((users ?? []).flatMap((user) => user.roles.map((role) => role.name)))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((name) => ({ value: name, label: name })),
    [users],
  );


  const filtered = table.state.columnFilters.length > 0;
  const rows = table.getRowModel().rows;

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o portal, com quais roles, e como anda a segurança de cada conta."
        actions={
          <RequirePermission permission="iam.user.create">
            <InviteDialog onInvited={load} />
          </RequirePermission>
        }
      />

      {administrators?.belowMinimum && (
        <Alert>
          <TriangleAlert />
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
          <CardDescription>Busque, filtre e aja sobre as contas sem sair da lista.</CardDescription>
          <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-64">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Buscar por nome ou e-mail"
                  placeholder="Buscar por nome ou e-mail…"
                  value={search}
                  onChange={(e) => {
                    table.getColumn("person")?.setFilterValue(e.target.value || undefined);
                    table.setPageIndex(0);
                  }}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("state")} title="Status" options={STATE_OPTIONS} />
              <DataTableFacetedFilter column={table.getColumn("roles")} title="Roles" options={roleOptions} />
              <DataTableFacetedFilter column={table.getColumn("mfa")} title="Duas etapas" options={MFA_OPTIONS} />
              <DataTableResetFilters table={table} />
            </div>
            <div className="flex items-center gap-2">
              <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
              <Tabs value={view} onValueChange={(value) => setView(value as "list" | "grid")}>
                <TabsList>
                  <TabsTrigger value="list" aria-label="Ver em lista">
                    <Rows3 />
                  </TabsTrigger>
                  <TabsTrigger value="grid" aria-label="Ver em grade">
                    <LayoutGrid />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !users ? (
            <TableSkeleton columns={5} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum usuário ainda"
              description="Convide as pessoas da empresa. Cada uma recebe um link para definir a própria senha."
            />
          ) : view === "list" ? (
            <DataTable
              table={table}
              onRowClick={(user) => router.push(`/settings/users/${user.id}`)}
              empty={<NoMatches onClear={() => table.resetColumnFilters()} />}
            />
          ) : rows.length === 0 ? (
            <NoMatches onClear={() => table.resetColumnFilters()} />
          ) : (
            <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <UserCard key={row.id} user={row.original} onChanged={load} />
              ))}
            </div>
          )}
        </CardContent>
        {users && users.length > 0 && !error && (
          <CardFooter className="border-t">
            <DataTablePagination table={table} noun={["usuário", "usuários"]} />
          </CardFooter>
        )}
      </Card>
      {filtered && <span className="sr-only" aria-live="polite">{`${table.getFilteredRowModel().rows.length} usuários encontrados`}</span>}
    </>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={Search}
      title="Nenhum usuário encontrado"
      description="Nenhuma conta atende à busca e aos filtros escolhidos."
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpar filtros
        </Button>
      }
    />
  );
}

function UserCard({ user, onChanged }: { user: UserSummary; onChanged: () => Promise<void> }) {
  return (
    <Card size="sm" className="shadow-none ring-1">
      <CardHeader>
        <Person user={user} />
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <UserActions user={user} onChanged={onChanged} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge user={user} />
          <MfaBadge user={user} />
        </div>
        <RoleBadges user={user} />
      </CardContent>
      <CardFooter className="border-t text-xs text-muted-foreground">
        Último acesso: <span className="ml-1 text-foreground">{formatRelative(user.lastLoginAt)}</span>
      </CardFooter>
    </Card>
  );
}

function InviteDialog({ onInvited }: { onInvited: () => Promise<void> }) {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Inviting is delegable; giving the new account access (roles) is reserved to administrators.
  const mayAssignRoles = hasPermission("iam.user.roles.assign");
  // "Convidar" in the sidebar's create menu lands here with ?convidar and opens the dialog.
  // It may arrive while this page is already open, so react to the query, not only to the mount.
  const requested = searchParams.has("convidar");
  const [handled, setHandled] = useState(false);
  const [open, setOpen] = useState(false);
  if (requested !== handled) {
    setHandled(requested);
    if (requested) setOpen(true);
  }
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [link, setLink] = useState<{ link: string; email: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchParams.has("convidar")) router.replace("/settings/users");
  }, [searchParams, router]);

  useEffect(() => {
    if (!open || !mayAssignRoles) return;
    api<RoleSummary[]>("/api/iam/roles").then(setRoles, () => setRoles([]));
  }, [open, mayAssignRoles]);

  const confirmGrant = grantsAdministrator(roles, new Set(), selected);

  function reset() {
    setEmail("");
    setName("");
    setSelected(new Set());
    setPassword("");
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
      setOpen(false);
      reset();
      if (issued.invitationLink) setLink({ link: issued.invitationLink, email: issued.user.email });
      else notifySuccess("Convite enviado", `${issued.user.email} recebeu o link por e-mail.`);
      await onInvited();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const nameError = fieldError(error, "name");
  const emailError = fieldError(error, "email");

  return (
    <>
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
              A pessoa recebe um link para definir a senha. O link vale por 48 horas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} noValidate={false}>
            <FieldGroup>
              <FormError error={error} />
              <Field data-invalid={!!nameError}>
                <FieldLabel htmlFor="invite-name">Nome</FieldLabel>
                <Input
                  id="invite-name"
                  required
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Maria Silva"
                  aria-invalid={!!nameError}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              <Field data-invalid={!!emailError}>
                <FieldLabel htmlFor="invite-email">E-mail</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  maxLength={320}
                  autoComplete="off"
                  placeholder="maria@empresa.com"
                  aria-invalid={!!emailError}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {emailError && <FieldError>{emailError}</FieldError>}
              </Field>
              {mayAssignRoles ? (
                <>
                  <Field>
                    <FieldLabel>Roles</FieldLabel>
                    <FieldDescription>O que a pessoa pode fazer assim que entrar.</FieldDescription>
                    <RolePicker roles={roles} selected={selected} onChange={setSelected} />
                  </Field>
                  {confirmGrant && <AdministratorGrantConfirmation value={password} onChange={setPassword} />}
                </>
              ) : (
                <Alert>
                  <ShieldCheck />
                  <AlertDescription>
                    A pessoa entra sem acesso a nenhuma área. Um administrador atribui as roles depois.
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Enviando…" : "Enviar convite"}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <InvitationLinkDialog link={link?.link ?? null} email={link?.email ?? ""} onClose={() => setLink(null)} />
    </>
  );
}
