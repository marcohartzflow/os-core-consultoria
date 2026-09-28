// Hand-written mirror of the API contracts. Phase 3 replaces this file with types generated from
// /api/v3/api-docs into packages/contracts.

export type AccountStatus = "INVITED" | "ACTIVE" | "DISABLED";

export interface Me {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  /** True until the person replaces a password chosen by someone else; the API refuses everything else meanwhile. */
  passwordChangeRequired: boolean;
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  status: AccountStatus;
  locked: boolean;
  lastLoginAt: string | null;
  roles: RoleRef[];
  createdAt: string;
}

export interface InvitationIssued {
  user: UserSummary;
  invitationLink: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
}

export interface PermissionDefinition {
  key: string;
  module: string;
  description: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastAccessedAt: string;
  current: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PendingActionView {
  id: string;
  conversationId: string;
  tool: string;
  summary: string;
  arguments: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED" | "FAILED";
  createdAt: string;
  expiresAt: string;
  result: string | null;
}

export interface ToolView {
  name: string;
  description: string;
  destructive: boolean;
}

export type AuditOrigin = "REST" | "AI_TOOL" | "SYSTEM";

export interface AuditEventView {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorEmail: string | null;
  origin: AuditOrigin;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  correlationId: string | null;
}

export interface Paged<T> {
  content: T[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

export interface ProblemDetail {
  status: number;
  title?: string;
  detail?: string;
}
