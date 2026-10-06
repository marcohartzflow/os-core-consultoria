/** Only internal paths, exactly as the API validates them (UiAction.Navigate); never a full URL. */
export function internalPath(path: unknown): string | null {
  return typeof path === "string" && /^\/[A-Za-z0-9._~/-]{0,2047}$/.test(path) && !path.startsWith("//")
    ? path
    : null;
}

/**
 * The frames of one agent turn (AiController / TurnStream), one type per event name. Tool events
 * carry the id of their call, so the start and the end of the same call match even when a tool runs
 * twice in a turn. A turn ends with exactly one `done` or `error`.
 */
export type TurnEvent =
  | { event: "token"; text: string }
  | { event: "thinking" }
  | { event: "tool_start"; callId: string; tool: string }
  | { event: "tool_call"; callId: string; tool: string }
  | { event: "tool_failed"; callId: string; tool: string; reason: string }
  | { event: "action_pending"; callId: string; actionId: string; tool: string; summary: string; arguments: string }
  | { event: "action_auto"; callId: string; tool: string; summary: string; arguments: string; scope: string }
  | { event: "ui_action"; type: string; path: string; label: string }
  | { event: "done"; text: string; totalTokens: number }
  | { event: "error"; message: string };

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** A frame as the API sends it, checked field by field; anything unknown or malformed is dropped. */
function toTurnEvent(name: string, data: unknown): TurnEvent | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  switch (name) {
    case "token":
      return { event: "token", text: str(d.text) };
    case "thinking":
      return { event: "thinking" };
    case "tool_start":
    case "tool_call":
      return { event: name, callId: str(d.callId), tool: str(d.tool) };
    case "tool_failed":
      return { event: "tool_failed", callId: str(d.callId), tool: str(d.tool), reason: str(d.reason) };
    case "action_pending":
      return {
        event: "action_pending",
        callId: str(d.callId),
        actionId: str(d.actionId),
        tool: str(d.tool),
        summary: str(d.summary),
        arguments: str(d.arguments),
      };
    case "action_auto":
      return {
        event: "action_auto",
        callId: str(d.callId),
        tool: str(d.tool),
        summary: str(d.summary),
        arguments: str(d.arguments),
        scope: str(d.scope),
      };
    case "ui_action":
      return { event: "ui_action", type: str(d.type), path: str(d.path), label: str(d.label) };
    case "done":
      return { event: "done", text: str(d.text), totalTokens: typeof d.totalTokens === "number" ? d.totalTokens : 0 };
    case "error":
      return { event: "error", message: str(d.message) };
    default:
      return null;
  }
}

/** One SSE block: `event:` and `data:` lines (several data lines join with "\n"); comments ignored. */
function parseBlock(block: string): TurnEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    // The specification strips a single space after the colon, not all whitespace.
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  try {
    return toTurnEvent(name, JSON.parse(data.join("\n")));
  } catch {
    return null;
  }
}

/**
 * Reads the Server-Sent Events of a fetch() body (HTML Living Standard, "Server-sent events"): blocks
 * separated by a blank line, with LF, CRLF or CR line endings. A last block without its blank line is
 * still read at the end of the stream.
 */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: TurnEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const drain = (final: boolean) => {
    // A CR at the very end may be the first half of a CRLF split across chunks: normalised next time.
    const pendingCr = !final && buffer.endsWith("\r");
    buffer = (pendingCr ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n") + (pendingCr ? "\r" : "");
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const event = parseBlock(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
      if (event) onEvent(event);
      separator = buffer.indexOf("\n\n");
    }
    if (final && buffer.trim()) {
      const event = parseBlock(buffer);
      buffer = "";
      if (event) onEvent(event);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain(false);
  }
  buffer += decoder.decode();
  drain(true);
}
