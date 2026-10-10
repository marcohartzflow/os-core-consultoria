import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ScrollText, ShieldCheck, UserPlus, Users } from "lucide-react";
import { AGENT_NAME, AgentMark } from "@/core/brand";
import { moduleNavigation, moduleQuickCreate } from "@/modules/navigation";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item. The API enforces it on every call regardless. */
  permission?: string;
  /**
   * Screens grouped under a folder of the sidebar (opens and closes in place). The folder itself is
   * not a screen: its `href` only names it, and it is hidden when the user may open none of them.
   */
  children?: NavItem[];
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
        { label: AGENT_NAME, href: "/chat", icon: AgentMark, permission: "ai.chat.use" },
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
  const allowed = (item: NavItem) => !item.permission || hasPermission(item.permission);
  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter(allowed)
        .map((item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item))
        .filter((item) => !item.children || item.children.length > 0),
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
    for (const entry of section.items) {
      // A folder adds its own name to the trail of the screens inside it.
      const items = entry.children ?? [entry];
      const trail = entry.children ? [{ label: section.title }, { label: entry.label }] : [{ label: section.title }];
      for (const item of items) {
        if (item.href === "/") continue;
        if (pathname === item.href) return [...trail, { label: item.label }];
        if (pathname.startsWith(item.href + "/")) {
          return [...trail, { label: item.label, href: item.href }, { label: "Detalhes" }];
        }
      }
    }
  }
  return [];
}
