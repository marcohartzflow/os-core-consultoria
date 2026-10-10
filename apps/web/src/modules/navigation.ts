import {
  Blocks,
  Building2,
  CalendarCheck,
  Clock,
  FolderKanban,
  Handshake,
  Landmark,
  ListPlus,
  ListTodo,
  PackageCheck,
  Workflow,
} from "lucide-react";
import type { NavItem, NavSection } from "@/core/shell/navigation";

/**
 * Client modules register their menu entries here. Each item may carry a permission key; the
 * shell hides entries the user cannot use, and the API enforces the permission on every call.
 * An item with `children` is a folder of the sidebar; the screens of the company's own operation
 * live in "Operacional".
 */
export const moduleNavigation: NavSection[] = [
  {
    title: "Empresa",
    items: [
      { label: "Comercial", href: "/comercial", icon: Handshake, permission: "empresa.comercial.read" },
      { label: "Financeiro", href: "/financeiro", icon: Landmark, permission: "empresa.financeiro.read" },
      {
        label: "Operacional",
        href: "#operacional",
        icon: Building2,
        children: [
          { label: "Projetos", href: "/projetos", icon: FolderKanban, permission: "consultoria.projeto.read" },
          { label: "Horas", href: "/horas", icon: Clock, permission: "consultoria.horas.read" },
          { label: "Reuniões", href: "/reunioes", icon: CalendarCheck, permission: "consultoria.reuniao.read" },
          { label: "Entregáveis", href: "/entregaveis", icon: PackageCheck, permission: "consultoria.projeto.read" },
          { label: "Tarefas", href: "/tasks", icon: ListTodo, permission: "tasks.task.read" },
        ],
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Automações", href: "/automacoes", icon: Workflow, permission: "empresa.automacao.read" },
      { label: "Integrações", href: "/integracoes", icon: Blocks, permission: "empresa.integracao.read" },
    ],
  },
];

/** Entries of the sidebar "Criar" menu; the target page opens its create dialog from the query. */
export const moduleQuickCreate: NavItem[] = [
  { label: "Nova tarefa", href: "/tasks?nova", icon: ListPlus, permission: "tasks.task.create" },
];
