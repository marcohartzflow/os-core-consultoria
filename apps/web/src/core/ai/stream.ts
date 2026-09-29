/** Only internal paths, exactly as the API validates them (UiAction.Navigate); never a full URL. */
export function internalPath(path: unknown): string | null {
  return typeof path === "string" && /^\/[A-Za-z0-9._~/-]{0,2047}$/.test(path) && !path.startsWith("//")
    ? path
    : null;
}

/** Minimal SSE reader for a fetch() body: `event:` + `data:` blocks separated by blank lines. */
export async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: Record<string, string>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const raw of block.split("\n")) {
        if (raw.startsWith("event:")) event = raw.slice(6).trim();
        else if (raw.startsWith("data:")) dataLines.push(raw.slice(5).trim());
      }
      if (dataLines.length) {
        try {
          onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, string>);
        } catch {
          // ignore malformed frame
        }
      }
      separator = buffer.indexOf("\n\n");
    }
  }
}
