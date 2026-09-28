"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { PermissionDefinition, RoleSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleSummary | "new" | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        api<RoleSummary[]>("/api/iam/roles"),
        hasPermission("iam.permission.read")
          ? api<PermissionDefinition[]>("/api/iam/permissions")
          : Promise.resolve([] as PermissionDefinition[]),
      ]).then(
        ([r, p]) => {
          setRoles(r);
          setPermissions(p);
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [hasPermission],
  );

  useEffect(() => {
    void load();
  }, [load]);

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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!roles ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">
                  {role.name} {role.system && <Badge variant="outline">sistema</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{role.description ?? "—"}</TableCell>
                <TableCell>{role.permissions.length}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(role)}>
                    {role.system || !hasPermission("iam.role.update") ? "Ver" : "Editar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const byModule = new Map<string, PermissionDefinition[]>();
    for (const permission of permissions) {
      byModule.set(permission.module, [...(byModule.get(permission.module) ?? []), permission]);
    }
    return [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
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
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/iam/roles/${role.id}`, { method: "DELETE" });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? role.name : "Nova role"}</DialogTitle>
          <DialogDescription>
            {role?.system
              ? "A role de sistema recebe automaticamente toda permissão nova e não pode ser editada."
              : "Marque as permissões que esta role concede."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="role-name">Nome</FieldLabel>
              <Input
                id="role-name"
                required
                maxLength={100}
                disabled={readOnly}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="role-description">Descrição</FieldLabel>
              <Input
                id="role-description"
                maxLength={500}
                disabled={readOnly}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {groups.length === 0 ? (
              <FieldDescription>
                {role ? `${role.permissions.length} permissões.` : "Sem acesso ao catálogo de permissões."}
              </FieldDescription>
            ) : (
              groups.map(([module, items]) => (
                <FieldSet key={module}>
                  <FieldLegend className="capitalize">{module}</FieldLegend>
                  <div className="grid gap-2">
                    {items.map((permission) => (
                      <FieldLabel
                        key={permission.key}
                        htmlFor={`perm-${permission.key}`}
                        className="flex items-start gap-2 font-normal"
                      >
                        <Checkbox
                          id={`perm-${permission.key}`}
                          disabled={readOnly}
                          checked={selected.has(permission.key)}
                          onCheckedChange={(checked) => toggle(permission.key, checked === true)}
                        />
                        <span>
                          <span>{permission.description || permission.key}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{permission.key}</span>
                        </span>
                      </FieldLabel>
                    ))}
                  </div>
                </FieldSet>
              ))
            )}
            <DialogFooter>
              {role && !role.system && (
                <RequirePermission permission="iam.role.delete">
                  <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
                    Excluir
                  </Button>
                </RequirePermission>
              )}
              {!readOnly && (
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </Button>
              )}
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
