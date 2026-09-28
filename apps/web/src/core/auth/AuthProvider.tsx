"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AuthContextValue {
  me: Me;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the current user once and redirects to /login whenever the API says the session is gone. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const toLogin = useCallback(() => {
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [router, pathname]);

  const refresh = useCallback(
    () =>
      api<Me>("/api/me").then(setMe, (error: unknown) => {
        if (error instanceof ApiError && error.unauthorized) toLogin();
        else setFailed(error instanceof Error ? error.message : "Erro inesperado");
      }),
    [toLogin],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      <div className="flex min-h-svh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Não foi possível carregar sua sessão</AlertTitle>
          <AlertDescription>{failed}</AlertDescription>
        </Alert>
      </div>
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
