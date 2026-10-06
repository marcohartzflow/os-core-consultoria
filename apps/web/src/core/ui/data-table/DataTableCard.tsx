import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The frame of every list: header with title and toolbar, the table, and the pagination footer,
 * with no loose space between them. The card's own gap and vertical padding are removed so the
 * table starts right under the toolbar line and the footer sits right under the last row, with
 * the same spacing on every screen.
 */
export function DataTableCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cn("gap-0 py-0", className)} {...props} />;
}

export function DataTableCardHeader({ className, ...props }: React.ComponentProps<typeof CardHeader>) {
  return <CardHeader className={cn("border-b pt-(--card-spacing)", className)} {...props} />;
}

export function DataTableCardFooter({ className, ...props }: React.ComponentProps<typeof CardFooter>) {
  return <CardFooter className={cn("border-t py-3 [.border-t]:pt-3", className)} {...props} />;
}
