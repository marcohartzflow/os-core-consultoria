"use client";

import type { RoleSummary } from "@/core/api/types";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldLabel } from "@/components/ui/field";

export function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: RoleSummary[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
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
            onCheckedChange={(checked) => toggle(role.id, checked === true)}
          />
          <span>
            <span className="font-medium">{role.name}</span>
            {role.description && <span className="block text-xs text-muted-foreground">{role.description}</span>}
          </span>
        </FieldLabel>
      ))}
    </div>
  );
}
