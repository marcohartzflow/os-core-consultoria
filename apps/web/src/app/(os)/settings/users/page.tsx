"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  LayoutGrid,
  Lock,
  RotateCw,
  Rows3,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { api } from "@/core/api/client";
import { DataTableCard, DataTableCardFooter, DataTableCardHeader } from "@/core/ui/data-table/DataTableCard";
import { fetchAll } from "@/core/api/query";
import { useLoad, type Loaded } from "@/core/api/useLoad";
import type { AdministratorStatus, InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { MfaBadge } from "@/core/iam/MfaBadge";
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
import { type DataTableColumnDef } from "@/core/ui/data-table/features";
import { useServerTable } from "@/core/ui/data-table/useServerTable";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Values are the API's UserQuery.State; the order follows the badge precedence.
const STATE_OPTIONS: FacetOption[] = [
  { value: "ACTIVE", label: "Ativo", icon: CircleCheck },
  { value: "INVITED", label: "Convidado", icon: CircleDashed },
  { value: "LOCKED", label: "Bloqueado", icon: Lock },
  { value: "DISABLED", label: "Desativado", icon: CircleSlash },
  { value: "ANONYMIZED", label: "Anonimizado", icon: UserX },
];

const MFA_OPTIONS: FacetOption[] = [
  { value: "true", label: "Ativa", icon: ShieldCheck },
  { value: "false", label: "Inativa", icon: ShieldAlert },
];

const COLUMN_LABELS: Record<string, string> = {
  roleId: "Roles",
  status: "Status",
  mfa: "Duas etapas",
  lastLoginAt: "Último acesso",
  createdAt: "Criado em",
};

const FILTERS = ["status", "roleId", "mfa"] as const;

/** Screen filters to API parameters: the status facet is the API's "state"; mfa is one boolean. */
function toParams(filters: Record<string, string[]>) {
  return {
    state: filters.status,
    roleId: filters.roleId,
    mfa: filters.mfa?.length === 1 ? filters.mfa[0] : undefined,
  };
}

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
            <Badge variant="secondary" tabIndex={0}>
              +{rest.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{rest.map((role) => role.name).join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function LastAccess({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-muted-foreground">Nunca</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="whitespace-nowrap">
          {formatRelative(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(iso)}</TooltipContent>
    </Tooltip>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "grid">("list");
  const administrators = useLoad((signal) => api<AdministratorStatus>("/api/iam/users/administrators", { signal }));
  const { hasPermission } = useAuth();
  const mayReadRoles = hasPermission("iam.role.read");
  const mayAssignRoles = hasPermission("iam.user.roles.assign");
  // Options of the roles filter and of the invitation's role picker; without iam.role.read the
  // filter is simply left out (and the picker shows the API's refusal).
  const roles = useLoad((signal) =>
    mayReadRoles || mayAssignRoles ? fetchAll<RoleSummary>("/api/iam/roles", {}, { signal }) : Promise.resolve([]),
  );
  // Row actions change status, sessions or MFA: reload the page of rows and the administrators count.
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const onChanged = useCallback(() => refreshRef.current(), []);

  const columns = useMemo<DataTableColumnDef<UserSummary>[]>(
    () => [
      {
        id: "name",
        accessorFn: (user) => user.name,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pessoa" />,
        cell: ({ row }) => <div className="min-w-52"><Person user={row.original} /></div>,
        enableHiding: false,
      },
      {
        id: "roleId",
        accessorFn: (user) => user.roles.map((role) => role.id),
        enableSorting: false,
        header: "Roles",
        cell: ({ row }) => <RoleBadges user={row.original} />,
      },
      {
        id: "status",
        accessorFn: (user) => user.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge user={row.original} />,
      },
      {
        id: "mfa",
        accessorFn: (user) => String(user.mfaEnabled),
        enableSorting: false,
        header: "Duas etapas",
        cell: ({ row }) => <MfaBadge enabled={row.original.mfaEnabled} />,
      },
      {
        id: "lastLoginAt",
        accessorFn: (user) => user.lastLoginAt ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Último acesso" />,
        cell: ({ row }) => <LastAccess iso={row.original.lastLoginAt} />,
      },
      {
        id: "createdAt",
        accessorFn: (user) => user.createdAt,
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
            <UserActions user={row.original} onChanged={onChanged} />
          </div>
        ),
      },
    ],
    [onChanged],
  );

  const users = useServerTable<UserSummary>({
    // Not "status": the API orders the raw status, while the column shows the badge precedence
    // (anonymized, locked, then status), so that order would look shuffled.
    sortable: ["name", "lastLoginAt", "createdAt"],
    defaultSort: { id: "name", desc: false },
    path: "/api/iam/users",
    columns,
    filters: FILTERS,
    toParams,
    initialVisibility: { createdAt: false },
    getRowId: (user) => user.id,
  });
  const { table, page } = users;

  useEffect(() => {
    refreshRef.current = async () => {
      await Promise.all([users.refresh(), administrators.refresh()]);
    };
  });

  const roleOptions = useMemo<FacetOption[]>(
    () =>
      (roles.data ?? [])
        .map((role) => ({ value: role.id, label: role.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [roles.data],
  );

  const total = page?.page.totalElements ?? 0;
  const rows = table.getRowModel().rows;
  const belowMinimum = administrators.data?.belowMinimum ? administrators.data : null;

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o portal, com quais roles, e como anda a segurança de cada conta."
        actions={
          <RequirePermission permission="iam.user.create">
            <InviteDialog roles={roles} onInvited={onChanged} />
          </RequirePermission>
        }
      />

      {belowMinimum && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>
            {belowMinimum.active} de {belowMinimum.minimum} administradores ativos
          </AlertTitle>
          <AlertDescription>
            {belowMinimum.active <= 1
              ? "Promova mais uma pessoa de confiança a administrador. Se a única conta de administrador for perdida, ninguém poderá gerenciar acessos."
              : `Promova mais ${belowMinimum.minimum - belowMinimum.active} ${belowMinimum.minimum - belowMinimum.active === 1 ? "pessoa" : "pessoas"} de confiança a administrador. Se todas as contas de administrador forem perdidas, ninguém poderá gerenciar acessos.`}
          </AlertDescription>
        </Alert>
      )}
      {administrators.error && (
        <Alert>
          <CircleAlert />
          <AlertTitle>Não foi possível conferir os administradores</AlertTitle>
          <AlertDescription>
            <p>O aviso de administradores abaixo do mínimo depende dessa conferência.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={administrators.retry}>
              <RotateCw data-icon="inline-start" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <DataTableCard>
        <DataTableCardHeader>
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
                  maxLength={200}
                  value={users.search}
                  onChange={(e) => users.setSearch(e.target.value)}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={STATE_OPTIONS} />
              {mayReadRoles && (
                <DataTableFacetedFilter column={table.getColumn("roleId")} title="Roles" options={roleOptions} />
              )}
              <DataTableFacetedFilter column={table.getColumn("mfa")} title="Duas etapas" options={MFA_OPTIONS} />
              <DataTableResetFilters visible={users.filtered} onReset={users.clearFilters} />
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
        </DataTableCardHeader>
        <CardContent className="px-0">
          {users.error ? (
            <ErrorState error={users.error} onRetry={users.retry} />
          ) : !page ? (
            <TableSkeleton columns={5} />
          ) : total === 0 && !users.filtered ? (
            <EmptyState
              icon={Users}
              title="Nenhum usuário ainda"
              description="Convide as pessoas da empresa. Cada uma recebe um link para definir a própria senha."
            />
          ) : view === "list" ? (
            <DataTable
              table={table}
              loading={users.loading}
              onRowClick={(user) => router.push(`/settings/users/${user.id}`)}
              empty={<NoMatches onClear={users.clearFilters} />}
            />
          ) : rows.length === 0 ? (
            <NoMatches onClear={users.clearFilters} />
          ) : (
            <div
              aria-busy={users.loading}
              className={cn(
                "grid gap-4 px-(--card-spacing) transition-opacity sm:grid-cols-2 xl:grid-cols-3",
                users.loading && "opacity-60",
              )}
            >
              {rows.map((row) => (
                <UserCard key={row.id} user={row.original} onChanged={onChanged} />
              ))}
            </div>
          )}
        </CardContent>
        {page && total > 0 && !users.error && (
          <DataTableCardFooter>
            <DataTablePagination table={table} noun={["usuário", "usuários"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>
      {/* Always mounted: a live region announces changes only once it exists. */}
      <span className="sr-only" aria-live="polite">
        {page && users.filtered ? `${total} ${total === 1 ? "usuário encontrado" : "usuários encontrados"}` : ""}
      </span>
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
          <MfaBadge enabled={user.mfaEnabled} />
        </div>
        <RoleBadges user={user} />
      </CardContent>
      <CardFooter className="border-t text-xs text-muted-foreground">
        Último acesso: <span className="ml-1 text-foreground">{formatRelative(user.lastLoginAt)}</span>
      </CardFooter>
    </Card>
  );
}

function InviteDialog({
  roles,
  onInvited,
}: {
  /** The page's roles load, shared with the filter. */
  roles: Loaded<RoleSummary[]>;
  onInvited: () => Promise<void>;
}) {
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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [link, setLink] = useState<{ link: string; email: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!searchParams.has("convidar")) return;
    // Drop only the signal; search, filters and page stay as they were.
    const rest = new URLSearchParams(searchParams);
    rest.delete("convidar");
    const query = rest.toString();
    router.replace(`/settings/users${query ? `?${query}` : ""}`, { scroll: false });
  }, [searchParams, router]);

  const confirmGrant = grantsAdministrator(roles.data ?? [], new Set(), selected);

  /** Closes the dialog and forgets what was typed (the grant password included). */
  function close() {
    setOpen(false);
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
      close();
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
          if (next) setOpen(true);
          else if (!busy) close();
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
                  <RolePicker
                    roles={roles.data}
                    error={roles.error}
                    onRetry={roles.retry}
                    description="O que a pessoa pode fazer assim que entrar."
                    selected={selected}
                    onChange={setSelected}
                  />
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
                <Button type="button" variant="outline" onClick={close} disabled={busy}>
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
