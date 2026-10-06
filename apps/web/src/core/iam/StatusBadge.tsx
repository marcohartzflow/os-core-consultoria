import type { UserSummary } from "@/core/api/types";
import { Badge } from "@/components/ui/badge";

function Dot() {
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
}

export function StatusBadge({ user }: { user: Pick<UserSummary, "status" | "locked" | "anonymizedAt"> }) {
  if (user.anonymizedAt) return <Badge variant="outline"><Dot />Anonimizado</Badge>;
  if (user.locked) return <Badge variant="destructive"><Dot />Bloqueado</Badge>;
  switch (user.status) {
    case "ACTIVE":
      return <Badge variant="secondary"><Dot />Ativo</Badge>;
    case "INVITED":
      return <Badge variant="outline"><Dot />Convidado</Badge>;
    case "DISABLED":
      return <Badge variant="destructive"><Dot />Desativado</Badge>;
  }
}
