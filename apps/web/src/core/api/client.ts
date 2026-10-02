import type { ProblemDetail } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string,
    /** RFC 9457 problem type, e.g. urn:os:problem:mfa-required. */
    public readonly type: string | null = null,
    /** Invalid request body: message per field name, as the API validated it. */
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(detail || title);
  }

  get unauthorized() {
    return this.status === 401;
  }
}

/**
 * An error raised in the browser whose message was written for the person (in Portuguese) and may be
 * shown as is. Any other Error is shown with a generic text: its message is technical and in English.
 */
export class UserFacingError extends Error {}

/** 403 types the API uses while the session is gated: the shell must re-read /api/me and redirect. */
const GATE_TYPES = new Set([
  "urn:os:problem:mfa-required",
  "urn:os:problem:mfa-enrolment-required",
  "urn:os:problem:password-change-required",
]);

interface SessionHandlers {
  /** The session is gone: any call answered 401. */
  unauthorized: () => void;
  /** The session is gated (second factor, enrolment, forced password change). */
  gated: () => void;
}

let sessionHandlers: SessionHandlers | null = null;

/** Installed by the authenticated shell so every call reacts to a lost or gated session, not only the first one. */
export function setSessionHandlers(handlers: SessionHandlers | null) {
  sessionHandlers = handlers;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const CSRF_HEADER = "X-XSRF-TOKEN";

/** Over HTTPS the API names the CSRF cookie with the __Host- prefix; over plain-HTTP development it has no prefix. */
function readCsrfCookie(): string | null {
  return readCookie("__Host-XSRF-TOKEN") ?? readCookie("XSRF-TOKEN");
}

/** The API issues the CSRF cookie lazily; ask for it once before the first mutating request. */
async function ensureCsrfCookie(): Promise<string> {
  let token = readCsrfCookie();
  if (!token) {
    const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    token = readCsrfCookie();
    if (!response.ok || !token) {
      throw new ApiError(response.status, "Não foi possível proteger a requisição", "Recarregue a página e tente de novo.");
    }
  }
  return token;
}

/** Headers for a hand-made mutating fetch (e.g. an SSE POST): CSRF token plus JSON content type. */
export async function mutationHeaders(): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", Accept: "text/event-stream", [CSRF_HEADER]: await ensureCsrfCookie() };
}

/** Used when a response carries no problem body (a proxy error page, a gateway timeout). */
const FALLBACKS: Record<number, { title: string; detail: string }> = {
  400: { title: "Requisição inválida", detail: "O servidor não aceitou os dados enviados." },
  404: { title: "Não encontrado", detail: "O item não existe ou foi removido." },
  429: { title: "Muitas tentativas", detail: "Aguarde um pouco e tente de novo." },
  500: { title: "Erro no servidor", detail: "O servidor não conseguiu concluir a operação. Tente de novo em instantes." },
  502: { title: "Servidor indisponível", detail: "O servidor não respondeu. Tente de novo em instantes." },
  503: { title: "Servidor indisponível", detail: "O servidor está temporariamente fora do ar. Tente de novo em instantes." },
  504: { title: "Servidor demorou demais", detail: "A operação não terminou a tempo. Tente de novo." },
};

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Cancels the request (the screen that asked for it went away); the call then rejects with an AbortError. */
  signal?: AbortSignal;
}

/**
 * Same-origin fetch to the Spring API (proxied by next.config rewrites). Sends the session cookie,
 * the CSRF header on mutations, and turns RFC 9457 problem responses into {@link ApiError}.
 */
export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    if (method !== "GET") headers[CSRF_HEADER] = await ensureCsrfCookie();
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof ApiError || isAbortError(e)) throw e;
    throw offline();
  }

  if (response.status === 204 || response.status === 202) return undefined as T;
  if (!response.ok) throw await problem(response);
  return (await response.json()) as T;
}

/** fetch rejects with a DOMException named "AbortError" when its signal is aborted (MDN, AbortController). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** fetch only rejects when no response arrived at all (offline, DNS, connection reset). */
function offline() {
  return new ApiError(0, "Sem conexão", "Não foi possível falar com o servidor. Confira sua conexão e tente de novo.");
}

/** Whether a 403 means the session is gated (second factor, enrolment, forced password change). */
export function isGated(error: ApiError): boolean {
  return error.status === 403 && error.type !== null && GATE_TYPES.has(error.type);
}

/**
 * Reads an RFC 9457 problem response into an {@link ApiError} and lets the shell react to a lost or
 * gated session. Exported for hand-made fetches (the assistant's SSE POST) so they react the same way.
 */
export async function problem(response: Response): Promise<ApiError> {
  let body: ProblemDetail | undefined;
  try {
    body = (await response.json()) as ProblemDetail;
  } catch {
    // non-JSON error body
  }
  const fallback = FALLBACKS[response.status] ?? (response.status >= 500 ? FALLBACKS[500] : FALLBACKS[400]);
  const error = new ApiError(
    response.status,
    body?.title ?? fallback.title,
    body?.detail ?? fallback.detail,
    body?.type ?? null,
    body?.errors ?? {},
  );
  if (error.unauthorized) sessionHandlers?.unauthorized();
  else if (isGated(error)) sessionHandlers?.gated();
  return error;
}

/** File name of a Content-Disposition header (RFC 6266), if it names one. */
function dispositionFileName(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // malformed encoding: fall back to the plain parameter
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Saves a blob built in the browser (or downloaded) as a file. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Some browsers read the URL only after click() returns: revoke it later, not right away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Downloads a file the API produces (a CSV export, the personal data) with the same session and
 * error handling as {@link api}: a refused request becomes an {@link ApiError} instead of a broken
 * download. `accept` is the media type the endpoint produces; problems are accepted beside it.
 */
export async function download(path: string, accept: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { Accept: `${accept}, application/problem+json` }, credentials: "same-origin" });
  } catch {
    throw offline();
  }
  if (!response.ok) throw await problem(response);
  const blob = await response.blob();
  saveFile(blob, dispositionFileName(response.headers.get("Content-Disposition")) ?? fallbackName);
}

const UNEXPECTED = "Ocorreu um erro inesperado. Tente de novo; se continuar, recarregue a página.";

/**
 * Title and text to show for any error: API problems and {@link UserFacingError} keep their own
 * wording; anything else (a TypeError, a browser exception) gets a generic text, never its raw message.
 */
export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) return { title: error.title, detail: error.detail };
  if (error instanceof UserFacingError) return { title: "Algo deu errado", detail: error.message };
  return { title: "Algo deu errado", detail: UNEXPECTED };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof UserFacingError) return error.message;
  return UNEXPECTED;
}
