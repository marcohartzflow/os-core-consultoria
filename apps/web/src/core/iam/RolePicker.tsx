"use client";

import type { RoleSummary } from "@/core/api/types";
import { PasswordInput } from "@/core/auth/PasswordInput";
import { ErrorState } from "@/core/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Checkboxes of the roles to hold, as one named group. `roles` is null while they load; a failed
 * load shows its error and a way to try again instead of an empty list.
 */
export function RolePicker({
  roles,
  error,
  onRetry,
  selected,
  onChange,
  legend = "Roles",
  description,
  disabled = false,
}: {
  roles: RoleSummary[] | null;
  error?: unknown;
  onRetry?: () => void;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  legend?: string;
  description?: string;
  disabled?: boolean;
}) {
  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  }
  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0">
        {legend}
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      {error ? (
        <ErrorState error={error} onRetry={onRetry} className="p-4" />
      ) : !roles ? (
        <div className="grid gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : roles.length === 0 ? (
        <FieldDescription>Nenhuma role cadastrada.</FieldDescription>
      ) : (
        <div className="grid gap-2">
          {roles.map((role) => (
            <FieldLabel
              key={role.id}
              htmlFor={`role-${role.id}`}
              className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 font-normal"
            >
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
      )}
    </FieldSet>
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
      <PasswordInput
        id="grant-password"
        autoComplete="current-password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldDescription>
        Conceder acesso de administrador exige confirmar com a sua senha. Os demais administradores recebem um aviso.
      </FieldDescription>
    </Field>
  );
}
