"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, CloudOff, Lock, RotateCw, SearchX, ServerCrash } from "lucide-react";
import { toast } from "sonner";
import { ApiError, describeError } from "@/core/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/** Toast after an action succeeded. */
export function notifySuccess(title: string, description?: string) {
  toast.success(title, { description });
}

/** Toast after an action failed; the API's own title and text when it sent a problem. */
export function notifyError(error: unknown, fallbackTitle?: string) {
  const { title, detail } = describeError(error);
  toast.error(error instanceof ApiError ? title : (fallbackTitle ?? title), { description: detail });
}

function iconFor(error: unknown): React.ReactNode {
  if (!(error instanceof ApiError)) return <CircleAlert />;
  if (error.status === 0) return <CloudOff />;
  if (error.status === 403) return <Lock />;
  if (error.status === 404) return <SearchX />;
  if (error.status >= 500) return <ServerCrash />;
  return <CircleAlert />;
}

/** A screen or block that could not load: what happened and a way to try again. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { title, detail } = describeError(error);
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{iconFor(error)}</EmptyMedia>
        <EmptyTitle>{forbidden ? "Sem permissão" : title}</EmptyTitle>
        <EmptyDescription>
          {forbidden ? "Sua conta não tem acesso a estes dados. Fale com um administrador se precisar." : detail}
        </EmptyDescription>
      </EmptyHeader>
      {onRetry && !forbidden && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw data-icon="inline-start" />
            Tentar novamente
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

/** Nothing to show yet, with an optional next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Error inside a form or dialog: stays next to the fields until the next attempt. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const { title, detail } = describeError(error);
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}

/** Message the API gave for one field of the last submission, if any. */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldErrors[field] : undefined;
}

/** Placeholder rows with the shape of a table while it loads. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-3 px-(--card-spacing) py-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={column === 0 ? "h-9 flex-2" : "h-4 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}
