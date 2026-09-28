import { ListTodo } from "lucide-react";
import type { NavSection } from "@/core/shell/navigation";

/**
 * Client modules register their menu entries here. Each item may carry a permission key; the
 * shell hides entries the user cannot use, and the API enforces the permission on every call.
 * The "tasks" entry belongs to the example module and can be removed together with it.
 */
export const moduleNavigation: NavSection[] = [
  {
    title: "Trabalho",
    items: [{ label: "Tarefas", href: "/tasks", icon: ListTodo, permission: "tasks.task.read" }],
  },
];
