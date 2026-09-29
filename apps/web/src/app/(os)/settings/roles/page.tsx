"use client";

import { useMemo, useState } from "react";
import { useTable } from "@tanstack/react-table";
import {
  BookKey,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldHalf,
  Trash2,
  UserCog,
} from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import type { PermissionDefinition, RoleSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
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
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TYPE_OPTIONS: FacetOption[] = [
  { value: "system", label: "Sistema", icon: ShieldCheck },
  { value: "custom", label: "Personalizada", icon: UserCog },
];

const COLUMN_LABELS: Record<string, string> = {
  type: "Tipo",
  userCount: "Pessoas",
  permissions: "Permissões",
};

const EMPTY_ROLES: RoleSummary[] = [];
const EMPTY_PERMISSIONS: PermissionDefinition[] = [];

function groupByModule(permissions: PermissionDefinition[]): [string, PermissionDefinition[]][] {
  const byModule = new Map<string, PermissionDefinition[]>();
  for (const permission of permissions) {
    byModule.set(permission.module, [...(byModule.get(permission.module) ?? []), permission]);
  }
  return [...byModule.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([module, items]) => [module, [...items].sort((a, b) => a.key.localeCompare(b.key))]);
}

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const mayReadCatalog = hasPermission("iam.permission.read");
  const [editing, setEditing] = useState<RoleSummary | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);

  const { data, error, refresh, retry } = useLoad(() =>
    Promise.all([
      api<RoleSummary[]>("/api/iam/roles"),
      mayReadCatalog ? api<PermissionDefinition[]>("/api/iam/permissions") : Promise.resolve(null),
    ]),
  );
  const roles = data?.[0] ?? null;
  const catalog = data?.[1] ?? null;

  const columns = useMemo<DataTableColumnDef<RoleSummary>[]>(
    () => [
      {
        id: "name",
        accessorFn: (role) => `${role.name} ${role.description ?? ""}`,
        filterFn: "includesString",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => (
          <div className="grid min-w-0 gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{row.original.name}</span>
              {row.original.system && (
                <Badge variant="secondary">
                  <ShieldCheck />
                  Sistema
                </Badge>
              )}
            </div>
            <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">
              {row.original.description || "Sem descrição"}
            </span>
          </div>
        ),
        enableHiding: false,
      },
      {
        id: "type",
        accessorFn: (role) => (role.system ? "system" : "custom"),
        filterFn: "arrIncludesSome",
        sortFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.system ? "Sistema" : "Personalizada"}</span>
        ),
      },
      {
        id: "userCount",
        accessorFn: (role) => role.userCount,
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pessoas" />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.userCount} {row.original.userCount === 1 ? "pessoa" : "pessoas"}
          </span>
        ),
      },
      {
        id: "permissions",
        accessorFn: (role) => role.permissions.length,
        sortFn: "basic",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Permissões" />,
        cell: ({ row }) => {
          const count = row.original.permissions.length;
          return catalog && catalog.length > 0 ? (
            <div className="flex min-w-36 items-center gap-3">
              <Progress
                value={Math.round((count / catalog.length) * 100)}
                className="h-1.5 w-20"
                aria-label={`${count} de ${catalog.length} permissões`}
              />
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {count} de {catalog.length}
              </span>
            </div>
          ) : (
            <span className="tabular-nums">{count}</span>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RoleActions role={row.original} onOpen={setEditing} onDelete={setDeleting} />
          </div>
        ),
      },
    ],
    [catalog],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: roles ?? EMPTY_ROLES,
    getRowId: (role) => role.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [{ id: "name", desc: false }],
    },
    autoResetPageIndex: false,
  });

  const search = (table.getColumn("name")?.getFilterValue() as string | undefined) ?? "";

  const stats = useMemo(() => {
    if (!roles) return null;
    const system = roles.find((role) => role.system);
    return {
      total: roles.length,
      custom: roles.filter((role) => !role.system).length,
      fullAccess: system?.userCount ?? 0,
    };
  }, [roles]);
  const reserved = catalog?.filter((permission) => permission.reserved).length;

  return (
    <>
      <PageHeader
        title="Roles e permissões"
        description="Uma role é um conjunto de permissões. Permissões existem porque um caso de uso as exige."
        actions={
          <RequirePermission permission="iam.role.create">
            <Button onClick={() => setEditing("new")}>
              <Plus />
              Nova role
            </Button>
          </RequirePermission>
        }
      />

      <StatGrid>
        <StatCard
          icon={ShieldHalf}
          label="Roles"
          value={stats?.total ?? null}
          hint={stats ? `${stats.custom} personalizadas e ${stats.total - stats.custom} de sistema` : "Sistema e personalizadas"}
        />
        {mayReadCatalog && (
          <StatCard
            icon={BookKey}
            label="Permissões no catálogo"
            value={catalog?.length ?? null}
            hint="Declaradas pelos módulos do portal"
          />
        )}
        {mayReadCatalog && (
          <StatCard
            icon={Lock}
            label="Permissões reservadas"
            value={reserved ?? null}
            hint="Só a role de sistema concede"
            badge={<Badge variant="outline">Só administrador</Badge>}
          />
        )}
        <StatCard
          icon={KeyRound}
          label="Pessoas com acesso total"
          value={stats?.fullAccess ?? null}
          hint="Contas com a role de sistema"
          badge={
            stats && stats.fullAccess < 2 ? (
              <Badge variant="destructive">Abaixo do mínimo</Badge>
            ) : (
              stats && <Badge variant="secondary">Ok</Badge>
            )
          }
        />
      </StatGrid>

      <Tabs defaultValue="roles" className="gap-4">
        <TabsList variant="line" className="w-full justify-start border-b ps-0 *:data-[slot=tabs-trigger]:flex-none">
          <TabsTrigger value="roles">Roles</TabsTrigger>
          {mayReadCatalog && <TabsTrigger value="catalog">Catálogo de permissões</TabsTrigger>}
        </TabsList>

        <TabsContent value="roles">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-xl leading-none">Roles</CardTitle>
              <CardDescription>
                A role de sistema tem acesso total e não pode ser alterada. Clique em uma role para ver ou editar.
              </CardDescription>
              <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <InputGroup className="w-full sm:w-64">
                    <InputGroupAddon align="inline-start">
                      <Search />
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label="Buscar roles"
                      placeholder="Buscar por nome ou descrição…"
                      value={search}
                      onChange={(e) => {
                        table.getColumn("name")?.setFilterValue(e.target.value || undefined);
                        table.setPageIndex(0);
                      }}
                    />
                  </InputGroup>
                  <DataTableFacetedFilter column={table.getColumn("type")} title="Tipo" options={TYPE_OPTIONS} />
                  <DataTableResetFilters table={table} />
                </div>
                <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {error ? (
                <ErrorState error={error} onRetry={retry} />
              ) : !roles ? (
                <TableSkeleton columns={4} />
              ) : roles.length === 0 ? (
                <EmptyState
                  icon={ShieldHalf}
                  title="Nenhuma role"
                  description="Crie uma role para agrupar as permissões que uma função da empresa precisa."
                />
              ) : (
                <DataTable
                  table={table}
                  onRowClick={setEditing}
                  empty={
                    <EmptyState
                      icon={Search}
                      title="Nenhuma role encontrada"
                      description="Nenhuma role atende à busca e aos filtros escolhidos."
                      action={
                        <Button variant="outline" size="sm" onClick={() => table.resetColumnFilters()}>
                          Limpar filtros
                        </Button>
                      }
                    />
                  }
                />
              )}
            </CardContent>
            {roles && roles.length > 0 && !error && (
              <CardFooter className="border-t">
                <DataTablePagination table={table} noun={["role", "roles"]} />
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {mayReadCatalog && (
          <TabsContent value="catalog">
            <PermissionCatalog catalog={catalog} roles={roles} error={error} onRetry={retry} />
          </TabsContent>
        )}
      </Tabs>

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          permissions={catalog ?? EMPTY_PERMISSIONS}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        destructive
        title={`Excluir a role ${deleting?.name ?? ""}?`}
        description={
          deleting && deleting.userCount > 0
            ? `${deleting.userCount} ${deleting.userCount === 1 ? "pessoa perde" : "pessoas perdem"} as permissões desta role na próxima requisição.`
            : "A role deixa de existir. Esta ação não pode ser desfeita."
        }
        confirmLabel="Excluir role"
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/iam/roles/${deleting.id}`, { method: "DELETE" });
          notifySuccess("Role excluída", `${deleting.name} foi removida.`);
          await refresh();
        }}
      />
    </>
  );
}

function RoleActions({
  role,
  onOpen,
  onDelete,
}: {
  role: RoleSummary;
  onOpen: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { hasPermission } = useAuth();
  const mayEdit = !role.system && hasPermission("iam.role.update");
  const mayDelete = !role.system && hasPermission("iam.role.delete");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Ações para ${role.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel className="truncate">{role.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onOpen(role)}>
          {mayEdit ? <Pencil /> : <ShieldCheck />}
          {mayEdit ? "Editar" : "Ver permissões"}
        </DropdownMenuItem>
        {mayDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(role)}>
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PermissionCatalog({
  catalog,
  roles,
  error,
  onRetry,
}: {
  catalog: PermissionDefinition[] | null;
  roles: RoleSummary[] | null;
  error: unknown;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const holders = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const role of roles ?? []) {
      for (const key of role.permissions) byKey.set(key, [...(byKey.get(key) ?? []), role.name]);
    }
    return byKey;
  }, [roles]);
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const matching = (catalog ?? []).filter(
      (permission) =>
        !needle ||
        permission.key.toLocaleLowerCase("pt-BR").includes(needle) ||
        permission.description.toLocaleLowerCase("pt-BR").includes(needle),
    );
    return groupByModule(matching);
  }, [catalog, query]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-xl leading-none">Catálogo de permissões</CardTitle>
        <CardDescription>
          Cada permissão protege um caso de uso, no portal e no assistente. As reservadas só a role de sistema concede.
        </CardDescription>
        <div className="col-span-full mt-3">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar permissões"
              placeholder="Buscar por chave ou descrição…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !catalog ? (
          <TableSkeleton columns={3} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhuma permissão encontrada"
            description="Nenhuma permissão tem essa chave ou descrição."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([module, items]) => (
              <section key={module} className="flex flex-col gap-3" aria-labelledby={`module-${module}`}>
                <div className="flex items-center gap-2">
                  <h3 id={`module-${module}`} className="font-medium capitalize">
                    {module}
                  </h3>
                  <Badge variant="outline" className="tabular-nums">
                    {items.length}
                  </Badge>
                </div>
                <ItemGroup className="gap-2">
                  {items.map((permission) => {
                    const heldBy = holders.get(permission.key) ?? [];
                    return (
                      <Item key={permission.key} variant="outline" size="sm">
                        <ItemContent>
                          <ItemTitle>
                            {permission.description || permission.key}
                            {permission.reserved && (
                              <Badge variant="outline">
                                <Lock />
                                Só administrador
                              </Badge>
                            )}
                          </ItemTitle>
                          <ItemDescription className="font-mono text-xs">{permission.key}</ItemDescription>
                        </ItemContent>
                        <ItemActions className="flex-wrap justify-end">
                          {heldBy.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Nenhuma role</span>
                          ) : (
                            heldBy.map((name) => (
                              <Badge key={name} variant="secondary">
                                {name}
                              </Badge>
                            ))
                          )}
                        </ItemActions>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoleDialog({
  role,
  permissions,
  onClose,
  onSaved,
}: {
  role: RoleSummary | null;
  permissions: PermissionDefinition[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const readOnly = role ? role.system || !hasPermission("iam.role.update") : false;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupByModule(permissions), [permissions]);

  function toggle(keys: string[], checked: boolean) {
    const next = new Set(selected);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    setSelected(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name, description: description || null, permissions: [...selected] };
    try {
      if (role) await api(`/api/iam/roles/${role.id}`, { method: "PUT", body });
      else await api("/api/iam/roles", { method: "POST", body });
      notifySuccess(role ? "Role atualizada" : "Role criada", `${name} tem ${selected.size} permissões.`);
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const nameError = fieldError(error, "name");
  const descriptionError = fieldError(error, "description");

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? role.name : "Nova role"}</DialogTitle>
          <DialogDescription>
            {role?.system
              ? "A role de sistema recebe automaticamente toda permissão nova e não pode ser editada."
              : readOnly
                ? "Você pode ver as permissões desta role, mas não alterá-las."
                : "Marque as permissões que esta role concede. A mudança vale na próxima requisição de cada pessoa."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            <FormError error={error} />
            <Field data-invalid={!!nameError}>
              <FieldLabel htmlFor="role-name">Nome</FieldLabel>
              <Input
                id="role-name"
                required
                maxLength={100}
                disabled={readOnly}
                placeholder="Financeiro"
                aria-invalid={!!nameError}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {nameError && <FieldError>{nameError}</FieldError>}
            </Field>
            <Field data-invalid={!!descriptionError}>
              <FieldLabel htmlFor="role-description">Descrição</FieldLabel>
              <Input
                id="role-description"
                maxLength={500}
                disabled={readOnly}
                placeholder="O que esta função faz no portal"
                aria-invalid={!!descriptionError}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {descriptionError && <FieldError>{descriptionError}</FieldError>}
            </Field>
            {groups.length === 0 ? (
              <FieldDescription>
                {role ? `${role.permissions.length} permissões.` : "Sem acesso ao catálogo de permissões."}
              </FieldDescription>
            ) : (
              groups.map(([module, items]) => {
                // Reserved permissions belong to the system role only; the API refuses them elsewhere.
                const selectable = items.filter((permission) => !permission.reserved).map((p) => p.key);
                const chosen = items.filter((permission) => selected.has(permission.key)).length;
                const chosenSelectable = selectable.filter((key) => selected.has(key)).length;
                const all = selectable.length > 0 && chosenSelectable === selectable.length;
                return (
                  <FieldSet key={module}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLegend variant="label" className="mb-0 capitalize">
                        {module}
                      </FieldLegend>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {chosen} de {items.length}
                        </span>
                        {!readOnly && selectable.length > 0 && (
                          <FieldLabel htmlFor={`all-${module}`} className="gap-2 text-xs font-normal">
                            <Checkbox
                              id={`all-${module}`}
                              checked={all ? true : chosenSelectable > 0 ? "indeterminate" : false}
                              onCheckedChange={(checked) => toggle(selectable, checked === true)}
                            />
                            Todas
                          </FieldLabel>
                        )}
                      </div>
                    </div>
                    <ItemGroup className="gap-2">
                      {items.map((permission) => (
                        <Item key={permission.key} variant="outline" size="sm" asChild>
                          <label htmlFor={`perm-${permission.key}`}>
                            <Checkbox
                              id={`perm-${permission.key}`}
                              disabled={readOnly || permission.reserved}
                              checked={selected.has(permission.key)}
                              onCheckedChange={(checked) => toggle([permission.key], checked === true)}
                            />
                            <ItemContent>
                              <ItemTitle>
                                {permission.description || permission.key}
                                {permission.reserved && (
                                  <Badge variant="outline">
                                    <Lock />
                                    Só administrador
                                  </Badge>
                                )}
                              </ItemTitle>
                              <ItemDescription className="font-mono text-xs">{permission.key}</ItemDescription>
                            </ItemContent>
                          </label>
                        </Item>
                      ))}
                    </ItemGroup>
                  </FieldSet>
                );
              })
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {readOnly ? "Fechar" : "Cancelar"}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Salvando…" : role ? "Salvar alterações" : "Criar role"}
                </Button>
              )}
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
