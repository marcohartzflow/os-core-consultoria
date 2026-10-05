import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ScrollText, ShieldCheck, Sparkles, UserPlus, Users } from "lucide-react";
import { moduleNavigation, moduleQuickCreate } from "@/modules/navigation";

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
    {
      title: "Início",
      items: [
        { label: "Painel", href: "/", icon: LayoutDashboard },
        { label: "Assistente", href: "/chat", icon: Sparkles, permission: "ai.chat.use" },
      ],
    },
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

/** "Criar" menu of the sidebar: module entries first, then the core ones the user may use. */
export function quickCreateFor(hasPermission: (permission: string) => boolean): NavItem[] {
  const items: NavItem[] = [
    ...moduleQuickCreate,
    { label: "Convidar usuário", href: "/settings/users?convidar", icon: UserPlus, permission: "iam.user.create" },
  ];
  return items.filter((item) => !item.permission || hasPermission(item.permission));
}

/** Trail for the header: section and screen from the navigation, plus "Detalhes" below a known screen. */
export function breadcrumbFor(
  pathname: string,
  hasPermission: (permission: string) => boolean,
): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: "Painel" }];
  for (const section of navigationFor(hasPermission)) {
    for (const item of section.items) {
      if (item.href === "/") continue;
      if (pathname === item.href) return [{ label: section.title }, { label: item.label }];
      if (pathname.startsWith(item.href + "/")) {
        return [{ label: section.title }, { label: item.label, href: item.href }, { label: "Detalhes" }];
      }
    }
  }
  return [];
}
