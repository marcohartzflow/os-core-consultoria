import { cookies } from "next/headers";
import { AuthProvider } from "@/core/auth/AuthProvider";
import type { Layout } from "react-resizable-panels";
import { AGENT_LAYOUT_COOKIE } from "@/core/ai/layout-cookie";
import { AppShell } from "@/core/shell/AppShell";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  // The sidebar component stores its open state in this cookie; reading it here avoids a flash.
  const jar = await cookies();
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  return (
    <AuthProvider>
      <AppShell sidebarOpen={sidebarOpen} agentLayout={agentLayout(jar.get(AGENT_LAYOUT_COOKIE)?.value)}>
        {children}
      </AppShell>
    </AuthProvider>
  );
}

/** Split between page and agent saved by the browser; anything malformed falls back to the default. */
function agentLayout(raw: string | undefined): Layout | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (!value || typeof value !== "object") return undefined;
    const { page, agent } = value as Record<string, unknown>;
    if (typeof page !== "number" || typeof agent !== "number") return undefined;
    if (page < 0 || agent < 0 || Math.abs(page + agent - 100) > 1) return undefined;
    return { page, agent };
  } catch {
    return undefined;
  }
}
