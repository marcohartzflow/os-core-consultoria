import type { ProblemDetail } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string,
    /** RFC 9457 problem type, e.g. urn:os:problem:mfa-required. */
    public readonly type: string | null = null,
  ) {
    super(detail || title);
  }

  get unauthorized() {
    return this.status === 401;
  }
}

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

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

/** The API issues the CSRF cookie lazily; ask for it once before the first mutating request. */
async function ensureCsrfCookie(): Promise<string> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    token = readCookie(CSRF_COOKIE);
  }
  return token ?? "";
}

/** Headers for a hand-made mutating fetch (e.g. an SSE POST): CSRF token plus JSON content type. */
export async function mutationHeaders(): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", Accept: "text/event-stream", [CSRF_HEADER]: await ensureCsrfCookie() };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Same-origin fetch to the Spring API (proxied by next.config rewrites). Sends the session cookie,
 * the CSRF header on mutations, and turns RFC 9457 problem responses into {@link ApiError}.
 */
export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers[CSRF_HEADER] = await ensureCsrfCookie();

  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204 || response.status === 202) return undefined as T;
  if (!response.ok) {
    let problem: ProblemDetail | undefined;
    try {
      problem = (await response.json()) as ProblemDetail;
    } catch {
      // non-JSON error body
    }
    const error = new ApiError(
      response.status,
      problem?.title ?? response.statusText,
      problem?.detail ?? "Falha ao comunicar com o servidor",
      problem?.type ?? null,
    );
    if (error.unauthorized) sessionHandlers?.unauthorized();
    else if (response.status === 403 && error.type && GATE_TYPES.has(error.type)) sessionHandlers?.gated();
    throw error;
  }
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}
