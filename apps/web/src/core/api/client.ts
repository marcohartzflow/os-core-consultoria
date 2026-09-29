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

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // fetch only rejects when no response arrived at all (offline, DNS, connection reset).
    throw new ApiError(0, "Sem conexão", "Não foi possível falar com o servidor. Confira sua conexão e tente de novo.");
  }

  if (response.status === 204 || response.status === 202) return undefined as T;
  if (!response.ok) {
    let problem: ProblemDetail | undefined;
    try {
      problem = (await response.json()) as ProblemDetail;
    } catch {
      // non-JSON error body
    }
    const fallback = FALLBACKS[response.status] ?? (response.status >= 500 ? FALLBACKS[500] : FALLBACKS[400]);
    const error = new ApiError(
      response.status,
      problem?.title ?? fallback.title,
      problem?.detail ?? fallback.detail,
      problem?.type ?? null,
      problem?.errors ?? {},
    );
    if (error.unauthorized) sessionHandlers?.unauthorized();
    else if (response.status === 403 && error.type && GATE_TYPES.has(error.type)) sessionHandlers?.gated();
    throw error;
  }
  return (await response.json()) as T;
}

/** Title and text to show for any error: API problems keep their own wording. */
export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) return { title: error.title, detail: error.detail };
  if (error instanceof Error) return { title: "Algo deu errado", detail: error.message };
  return { title: "Algo deu errado", detail: "Erro inesperado" };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}
