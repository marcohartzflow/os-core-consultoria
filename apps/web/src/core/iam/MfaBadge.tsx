import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Second factor of an account. `named` spells out what is active, for places without a column header. */
export function MfaBadge({ enabled, named = false }: { enabled: boolean; named?: boolean }) {
  return enabled ? (
    <Badge variant="secondary">
      <ShieldCheck />
      {named ? "Duas etapas ativa" : "Ativa"}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      <ShieldAlert />
      {named ? "Duas etapas inativa" : "Inativa"}
    </Badge>
  );
}
