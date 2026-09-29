import type { TaskSummary } from "./types";

/** Local calendar date as the API's `YYYY-MM-DD` (LocalDate); comparing these strings compares days. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** `YYYY-MM-DD` to a local Date at midnight (never through UTC, which would shift the day). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(parseDay(iso));
}

export type Due = "overdue" | "today" | "tomorrow" | "soon" | "later" | "none" | "done";

/** Where an open task stands against its due date; done tasks are never late. */
export function dueOf(task: Pick<TaskSummary, "status" | "dueDate">, now: Date = new Date()): Due {
  if (task.status === "DONE") return "done";
  if (!task.dueDate) return "none";
  const today = isoDay(now);
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  if (task.dueDate === isoDay(addDays(now, 1))) return "tomorrow";
  if (task.dueDate <= isoDay(addDays(now, 7))) return "soon";
  return "later";
}
