// Types of the API come from the generated contracts (packages/contracts). Only the aliases the
// web code uses are re-exported here, plus the few shapes the OpenAPI document does not describe.
import type {
  AdministratorStatus,
  AuditEventView,
  ChatMessage,
  ConversationSummary,
  InvitationIssued,
  MeResponse,
  MfaStatus,
  PagedModelAuditEventView,
  PendingActionView,
  PermissionDefinition,
  RoleRef,
  RoleSummary,
  SessionInfo,
  Setup,
  ToolView,
  UserSummary,
} from "@maximusflow/contracts";

export type {
  AdministratorStatus,
  AuditEventView,
  ChatMessage,
  ConversationSummary,
  InvitationIssued,
  MfaStatus,
  PendingActionView,
  PermissionDefinition,
  RoleRef,
  RoleSummary,
  SessionInfo,
  ToolView,
  UserSummary,
};

export type Me = MeResponse;
export type MfaSetup = Setup;
export type AccountStatus = UserSummary["status"];
export type AuditOrigin = AuditEventView["origin"];
// Spring Data's PagedModel is not one of our records, so the document leaves its fields optional; the API always sends them.
export type Paged<T> = { content: T[]; page: Required<NonNullable<PagedModelAuditEventView["page"]>> };

/** RFC 9457 body of every error response. */
export interface ProblemDetail {
  status: number;
  title?: string;
  detail?: string;
  type?: string;
}
