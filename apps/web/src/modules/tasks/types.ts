// Contracts of the tasks module, mirrored by hand from /api/tasks until the OpenAPI client exists.

export type TaskStatus = "OPEN" | "DONE";

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRequest {
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
}
