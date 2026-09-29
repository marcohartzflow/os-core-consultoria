import type { LucideIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Indicator card in the style of the shadcn dashboard block: label, big number, a badge on the
 * right and a line of context below. `value` null renders a placeholder while loading.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  badge,
  hint,
  footer,
}: {
  label: string;
  value: React.ReactNode | null;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  hint?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon && <Icon className="size-4" />}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value === null ? <Skeleton className="h-8 w-16" /> : value}
        </CardTitle>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      {(hint || footer) && (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          {footer && <div className="line-clamp-1 flex items-center gap-2 font-medium">{footer}</div>}
          {hint && <div className="text-muted-foreground">{hint}</div>}
        </CardFooter>
      )}
    </Card>
  );
}

/** Grid for a row of StatCards, with the reference's subtle gradient. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {children}
    </div>
  );
}
