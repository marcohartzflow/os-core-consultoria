import { AuthProvider } from "@/core/auth/AuthProvider";
import { AppShell } from "@/core/shell/AppShell";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
