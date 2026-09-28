import type { UserSummary } from "@/core/api/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ user }: { user: Pick<UserSummary, "status" | "locked" | "anonymizedAt"> }) {
  if (user.anonymizedAt) return <Badge variant="outline">Anonimizado</Badge>;
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
