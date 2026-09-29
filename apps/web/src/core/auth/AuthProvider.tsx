"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, setSessionHandlers } from "@/core/api/client";
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
  const toLogin = useCallback(() => {
    const current = window.location.pathname;
    const next = current && current !== "/" ? `?next=${encodeURIComponent(current)}` : "";
    router.replace(`/login${next}`);
  }, [router]);

  const refresh = useCallback(
    () =>
      api<Me>("/api/me").then(setMe, (error: unknown) => {
        if (error instanceof ApiError && error.unauthorized) toLogin();
        else setFailed(error);
      }),
    [toLogin],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSessionHandlers({ unauthorized: toLogin, gated: () => void refresh() });
    return () => setSessionHandlers(null);
  }, [toLogin, refresh]);

  // The API gates the session until these are resolved; keep the person on the right screen.
  useEffect(() => {
    if (!me) return;
    if (me.mfa.enabled && !me.mfa.verified) {
      if (pathname !== "/mfa") router.replace("/mfa");
      return;
    }
    if ((me.passwordChangeRequired || (me.mfa.required && !me.mfa.enabled)) && pathname !== "/account") {
      router.replace("/account");
    }
  }, [me, pathname, router]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
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

  if (failed) {
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
      <div className="flex min-h-svh">
        <Skeleton className="hidden h-svh w-64 md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
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
