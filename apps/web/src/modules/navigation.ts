import { ListPlus, ListTodo } from "lucide-react";
import type { NavItem, NavSection } from "@/core/shell/navigation";

/**
 * Client modules register their menu entries here. Each item may carry a permission key; the
 * shell hides entries the user cannot use, and the API enforces the permission on every call.
 * The "tasks" entries belong to the example module and can be removed together with it.
 */
export const moduleNavigation: NavSection[] = [
  {
    title: "Trabalho",
    items: [{ label: "Tarefas", href: "/tasks", icon: ListTodo, permission: "tasks.task.read" }],
  },
];

/** Entries of the sidebar "Criar" menu; the target page opens its create dialog from the query. */
export const moduleQuickCreate: NavItem[] = [
  { label: "Nova tarefa", href: "/tasks?nova", icon: ListPlus, permission: "tasks.task.create" },
];
