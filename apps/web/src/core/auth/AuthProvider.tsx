"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, setSessionHandlers } from "@/core/api/client";
import { clearAgentPreferences } from "@/core/ai/preferences";
import type { Me } from "@/core/api/types";
import { ErrorState } from "@/core/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";

interface AuthContextValue {
  me: Me;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Sequence of /api/me reads; there is one AuthProvider, so module scope is enough. */
let latestMeRequest = 0;

/**
 * Loads the current user once, redirects to /login whenever any API call says the session is gone,
 * and re-reads /api/me whenever a call says the session is gated so the gate effect below applies.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState<unknown>(null);

  // Reads the location at call time (not the render's pathname) so a route change does not
  // re-create the callback and re-fetch /api/me on every navigation.
  // The session can end without a logout (expired, revoked): the assistant's remembered preferences
  // go with it all the same.
  const toLogin = useCallback(() => {
    clearAgentPreferences();
    const current = window.location.pathname + window.location.search;
    const next = current !== "/" ? `?next=${encodeURIComponent(current)}` : "";
    router.replace(`/login${next}`);
  }, [router]);

  // Refreshes overlap (mount, gated calls, after a mutation): only the latest one may write, or an
  // older answer arriving last would bring back a state the session already left. Once the portal
  // is up, a failed refresh keeps the current state instead of replacing the whole app (the error
  // screen below only shows while there is no user yet).
  const refresh = useCallback(() => {
    const request = ++latestMeRequest;
    return api<Me>("/api/me").then(
      (value) => {
        if (request !== latestMeRequest) return;
        setMe(value);
        setFailed(null);
      },
      (error: unknown) => {
        if (request !== latestMeRequest) return;
        if (error instanceof ApiError && error.unauthorized) toLogin();
        else setFailed(error);
      },
    );
  }, [toLogin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSessionHandlers({ unauthorized: toLogin, gated: () => void refresh() });
    return () => setSessionHandlers(null);
  }, [toLogin, refresh]);

  // The API gates the session until the second step of the login is done; keep the person on
  // its screen. The account gate (new password, required second factor) is drawn by the AppShell.
  useEffect(() => {
    if (me && me.mfa.enabled && !me.mfa.verified && pathname !== "/mfa") router.replace("/mfa");
  }, [me, pathname, router]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Already gone or offline: the session ends on this side regardless, and callers use `void logout()`.
    } finally {
      clearAgentPreferences();
      router.replace("/login");
    }
  }, [router]);

  const value = useMemo<AuthContextValue | null>(
    () =>
      me
        ? {
            me,
            hasPermission: (permission) => me.permissions.includes(permission),
            refresh,
            logout,
          }
        : null,
    [me, refresh, logout],
  );

  if (failed && !me) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <ErrorState
          error={failed}
          onRetry={() => {
            setFailed(null);
            void refresh();
          }}
        />
      </main>
    );
  }
  if (!value) {
    return (
      // The shell's frame (menu, header, content) while the session is read, so the portal does
      // not jump into place when it arrives.
      <div className="flex min-h-svh bg-sidebar" aria-busy="true" aria-label="Carregando o portal">
        <div className="hidden w-68 shrink-0 flex-col gap-2 p-4 md:flex">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-2 h-9 w-full" />
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col bg-background md:m-2 md:ml-0 md:rounded-2xl md:shadow-sm md:ring-1 md:ring-border">
          <div className="flex h-12 items-center gap-2 border-b px-4 lg:px-6">
            <Skeleton className="size-7" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-8 w-32" />
          </div>
          <div className="flex flex-col gap-4 p-4 md:p-6">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/** Renders children only when the user holds the permission. The API enforces it regardless. */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  return <>{hasPermission(permission) ? children : fallback}</>;
}
