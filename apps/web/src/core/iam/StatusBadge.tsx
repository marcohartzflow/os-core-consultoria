import type { UserSummary } from "@/core/api/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ user }: { user: Pick<UserSummary, "status" | "locked"> }) {
  if (user.locked) return <Badge variant="destructive">Bloqueado</Badge>;
  switch (user.status) {
    case "ACTIVE":
      return <Badge variant="secondary">Ativo</Badge>;
    case "INVITED":
      return <Badge variant="outline">Convidado</Badge>;
    case "DISABLED":
      return <Badge variant="destructive">Desativado</Badge>;
  }
}
