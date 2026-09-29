import { cookies } from "next/headers";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { AppShell } from "@/core/shell/AppShell";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  // The sidebar component stores its open state in this cookie; reading it here avoids a flash.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <AuthProvider>
      <AppShell sidebarOpen={sidebarOpen}>{children}</AppShell>
    </AuthProvider>
  );
}
