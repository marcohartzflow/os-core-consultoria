// Types of the API come from the generated contracts (packages/contracts). Only the aliases the
// web code uses are re-exported here, plus the few shapes the OpenAPI document does not describe.
import type {
  AdministratorStatus,
  AuditActivityDay,
  AuditEventView,
  ChatMessage,
  ConversationSummary,
  InvitationIssued,
  MeResponse,
  ModelView,
  MfaStatus,
  NotificationEmailRequest,
  AuditEventPage,
  Passkey,
  PasswordRequest,
  RecoveryCodes,
  PagedModelUserSummary,
  SecondFactorReset,
  PendingActionView,
  PermissionDefinition,
  RoleRef,
  RoleSummary,
  SessionInfo,
  Setup,
  SetupRequest,
  ToolSetting,
  ToolView,
  UserSummary,
} from "@maximusflow/contracts";

export type {
  AdministratorStatus,
  AuditActivityDay,
  AuditEventPage,
  AuditEventView,
  ChatMessage,
  ConversationSummary,
  InvitationIssued,
  MfaStatus,
  ModelView,
  NotificationEmailRequest,
  Passkey,
  PasswordRequest,
  PendingActionView,
  RecoveryCodes,
  PermissionDefinition,
  SecondFactorReset,
  RoleRef,
  RoleSummary,
  SessionInfo,
  ToolSetting,
  ToolView,
  UserSummary,
};

export type Me = MeResponse;
export type MfaSetup = Setup;
export type MfaSetupRequest = SetupRequest;
export type AccountStatus = UserSummary["status"];
export type AuditOrigin = AuditEventView["origin"];
// Spring Data's PagedModel is not one of our records, so the document leaves its fields optional; the API always sends them.
export type Paged<T> = { content: T[]; page: Required<NonNullable<PagedModelUserSummary["page"]>> };

/** RFC 9457 body of every error response. */
export interface ProblemDetail {
  status: number;
  title?: string;
  detail?: string;
  type?: string;
  /** Present on 400 "Dados inválidos": message per field name. */
  errors?: Record<string, string>;
}
