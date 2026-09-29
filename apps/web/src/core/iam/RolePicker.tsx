"use client";

import type { RoleSummary } from "@/core/api/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function RolePicker({
  roles,
  selected,
  onChange,
  disabled = false,
}: {
  roles: RoleSummary[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  }
  if (roles.length === 0) return <FieldDescription>Nenhuma role cadastrada.</FieldDescription>;
  return (
    <div className="grid gap-2">
      {roles.map((role) => (
        <FieldLabel key={role.id} htmlFor={`role-${role.id}`} className="flex items-start gap-2 font-normal">
          <Checkbox
            id={`role-${role.id}`}
            checked={selected.has(role.id)}
            disabled={disabled}
            onCheckedChange={(checked) => toggle(role.id, checked === true)}
          />
          <span>
            <span className="font-medium">{role.name}</span>
            {role.system && (
              <Badge variant="secondary" className="ml-2">
                Acesso total
              </Badge>
            )}
            {role.description && <span className="block text-xs text-muted-foreground">{role.description}</span>}
          </span>
        </FieldLabel>
      ))}
    </div>
  );
}

/** True when the new selection adds the system administrator role that was not held before. */
export function grantsAdministrator(roles: RoleSummary[], before: Set<string>, selected: Set<string>): boolean {
  return roles.some((role) => role.system && selected.has(role.id) && !before.has(role.id));
}

/** The API asks for the granting person's password before anyone becomes an administrator. */
export function AdministratorGrantConfirmation({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="grant-password">Sua senha</FieldLabel>
      <Input
        id="grant-password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldDescription>
        Conceder acesso de administrador exige confirmar com a sua senha. Os demais administradores recebem um aviso.
      </FieldDescription>
    </Field>
  );
}
