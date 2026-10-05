import type { ChatMessage, PendingActionView } from "@/core/api/types";
import { internalPath, type TurnEvent } from "./stream";

/**
 * What the assistant did in a turn, shown as a timeline above the answer (AI SDK cookbook, "Call
 * tools in multiple steps"): a tool that runs or ran, one that failed, an action that asked for
 * approval (a card inside the turn with its outcome, "Render visual interface in chat"), and an action
 * that ran without asking because the person allowed it. `callId` ties the start and the end of the
 * same call; steps loaded from the history have none.
 */
export type Step =
  | { kind: "tool"; callId?: string; tool: string; running: boolean }
  | { kind: "failed"; callId?: string; tool: string; reason?: string }
  | { kind: "pending"; callId?: string; tool: string; action: PendingActionView }
  | { kind: "auto"; callId?: string; tool: string; summary?: string; arguments?: string; scope: AutoScope };

export type AutoScope = "ONCE" | "CONVERSATION" | "ALWAYS";

/** How far a confirmation reaches: this call, the rest of the conversation, or always (ToolPermissionService). */
export type ConfirmScope = "ONCE" | "CONVERSATION" | "ALWAYS";

export interface AssistantTurn {
  id: string;
  role: "assistant";
  text: string;
  steps: Step[];
  links: { href: string; label: string }[];
  streaming: boolean;
  /** The model is reasoning now: since when (performance.now()). */
  thinkingSince?: number;
  /** Milliseconds spent reasoning in this turn, over all reasoning blocks. */
  thoughtMs?: number;
  /** Tokens the provider reported for the turn, tool rounds included. */
  tokens?: number;
  /** The turn ended without a full answer: a server error, or the person stopped it. */
  error?: string;
  interrupted?: boolean;
}

export type Turn = { id: string; role: "user"; text: string } | AssistantTurn;

/** An action that still waits for the person's decision (and has not expired). */
export function isOpenAction(action: PendingActionView, now = Date.now()) {
  return action.status === "PENDING" && (!action.expiresAt || new Date(action.expiresAt).getTime() > now);
}

const toAutoScope = (scope: string | null | undefined): AutoScope =>
  scope === "CONVERSATION" || scope === "ONCE" ? scope : "ALWAYS";

/** A turn of the history as the API returns it, with the steps the audit trail recorded. */
export function fromHistory(conversationId: string, m: ChatMessage, index: number): Turn {
  const id = `${conversationId}-${index}`;
  if (m.role === "user") return { id, role: "user", text: m.text };
  return {
    id,
    role: "assistant",
    text: m.text,
    steps: m.steps.flatMap((step): Step[] => {
      switch (step.kind) {
        case "failed":
          return [{ kind: "failed", tool: step.tool, reason: step.reason ?? undefined }];
        case "pending":
          return step.action ? [{ kind: "pending", tool: step.tool, action: step.action }] : [];
        case "auto":
          return [{ kind: "auto", tool: step.tool, scope: toAutoScope(step.scope) }];
        default:
          return [{ kind: "tool", tool: step.tool, running: false }];
      }
    }),
    links: [],
    streaming: false,
  };
}

/** Closes a reasoning block: its time joins the turn's total. */
function endThinking(turn: AssistantTurn, now: number): Partial<AssistantTurn> {
  return turn.thinkingSince === undefined
    ? {}
    : { thinkingSince: undefined, thoughtMs: (turn.thoughtMs ?? 0) + now - turn.thinkingSince };
}

/** The step of a call, matched by its id (a tool may run twice in one turn). */
function replaceCall(steps: Step[], callId: string, next: Step): Step[] {
  const at = steps.findIndex((s) => s.callId === callId);
  return at >= 0 ? steps.map((s, i) => (i === at ? next : s)) : [...steps, next];
}

/**
 * How one frame of the stream changes the answer being written. Pure: the same turn and frame give
 * the same result, so it runs inside a state updater and can be tested on its own. `now` is
 * performance.now(), for the reasoning time.
 */
export function applyTurnEvent(turn: AssistantTurn, event: TurnEvent, now: number): AssistantTurn {
  switch (event.event) {
    case "thinking":
      return turn.thinkingSince === undefined ? { ...turn, thinkingSince: now } : turn;
    case "token":
      return { ...turn, ...endThinking(turn, now), text: turn.text + event.text };
    case "tool_start":
      return {
        ...turn,
        ...endThinking(turn, now),
        steps: [...turn.steps, { kind: "tool", callId: event.callId, tool: event.tool, running: true }],
      };
    case "tool_call":
      return {
        ...turn,
        ...endThinking(turn, now),
        steps: replaceCall(turn.steps, event.callId, { kind: "tool", callId: event.callId, tool: event.tool, running: false }),
      };
    case "tool_failed":
      return {
        ...turn,
        ...endThinking(turn, now),
        steps: replaceCall(turn.steps, event.callId, {
          kind: "failed",
          callId: event.callId,
          tool: event.tool,
          reason: event.reason || undefined,
        }),
      };
    case "action_pending":
      return {
        ...turn,
        ...endThinking(turn, now),
        steps: [
          ...turn.steps,
          {
            kind: "pending",
            callId: event.callId,
            tool: event.tool,
            action: {
              id: event.actionId,
              conversationId: "",
              tool: event.tool,
              summary: event.summary,
              arguments: event.arguments,
              status: "PENDING",
              createdAt: new Date().toISOString(),
              expiresAt: "",
              result: null,
            },
          },
        ],
      };
    case "action_auto":
      return {
        ...turn,
        ...endThinking(turn, now),
        steps: replaceCall(turn.steps, event.callId, {
          kind: "auto",
          callId: event.callId,
          tool: event.tool,
          summary: event.summary,
          arguments: event.arguments,
          scope: toAutoScope(event.scope),
        }),
      };
    case "ui_action": {
      const href = event.type === "navigate" ? internalPath(event.path) : null;
      // One link per screen: two tasks created in one answer both point to /tasks.
      if (!href || turn.links.some((l) => l.href === href)) return turn;
      return { ...turn, links: [...turn.links, { href, label: event.label || href }] };
    }
    case "done":
      return {
        ...turn,
        ...endThinking(turn, now),
        text: event.text || turn.text,
        streaming: false,
        tokens: event.totalTokens > 0 ? event.totalTokens : undefined,
      };
    case "error":
      return { ...turn, ...endThinking(turn, now), streaming: false, error: event.message };
  }
}

/**
 * The stream ended without `done` or `error` (a proxy or the API dropped it): what was written is
 * kept, marked as cut short; tools still shown as running stop.
 */
export function cutShort(turn: AssistantTurn, error?: string): AssistantTurn {
  return {
    ...turn,
    streaming: false,
    thinkingSince: undefined,
    steps: turn.steps.map((s) => (s.kind === "tool" && s.running ? { ...s, running: false } : s)),
    ...(error ? { error } : { interrupted: true }),
  };
}
