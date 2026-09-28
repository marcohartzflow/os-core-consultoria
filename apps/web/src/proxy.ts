import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "OS_SESSION";
const PUBLIC_PREFIXES = ["/login", "/invite", "/password-reset"];

/**
 * Two jobs on every page request:
 *
 * 1. Routing on cookie presence only. Authorization is enforced by the API on every call; this just
 *    avoids rendering the shell for someone without a session and the login page for someone who
 *    already has one. An expired cookie still reaches the shell, which then gets a 401 from
 *    /api/me and redirects to /login.
 * 2. A per-request Content-Security-Policy with a nonce. Next.js reads the nonce from this header
 *    and stamps it on every script it emits, so no inline script without the nonce can run.
 *    Pages must render dynamically for the nonce to apply (see `dynamic` in app/layout.tsx).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isPublic && !hasSession) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  // style-src needs 'unsafe-inline': Radix primitives position popovers with inline style
  // attributes, which nonces cannot cover. Script execution stays nonce-only.
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except the API proxy, Next internals and static assets; skip prefetches.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
