import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ScrollText, ShieldCheck, Users } from "lucide-react";
import { moduleNavigation } from "@/modules/navigation";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item. The API enforces it on every call regardless. */
  permission?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Core sections first, client modules after, administration last. */
export function navigationFor(hasPermission: (permission: string) => boolean): NavSection[] {
  const sections: NavSection[] = [
    { title: "Início", items: [{ label: "Painel", href: "/", icon: LayoutDashboard }] },
    ...moduleNavigation,
    {
      title: "Administração",
      items: [
        { label: "Usuários", href: "/settings/users", icon: Users, permission: "iam.user.read" },
        { label: "Roles e permissões", href: "/settings/roles", icon: ShieldCheck, permission: "iam.role.read" },
        { label: "Auditoria", href: "/settings/audit", icon: ScrollText, permission: "audit.event.read" },
      ],
    },
  ];
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
