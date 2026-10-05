import { TableSkeleton } from "./feedback";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholders in the shape of the screens, for the route `loading.tsx` files: the next screen
 * appears at once with its frame (title, indicators, list) instead of a blank wait, and nothing
 * jumps when the data arrives. Built from the same Card and Skeleton the screens use, so a preset
 * restyles them together.
 */

function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-36" />}
    </div>
  );
}

function StatsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader className="gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A list screen: title, toolbar with search and filters, rows. */
export function ListPageSkeleton({ columns = 5, rows = 8, action = true }: { columns?: number; rows?: number; action?: boolean }) {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true" aria-label="Carregando">
      <HeaderSkeleton action={action} />
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-wrap items-center gap-2 border-b py-(--card-spacing)">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="ml-auto h-9 w-24" />
        </CardHeader>
        <CardContent className="px-0 py-3">
          <TableSkeleton rows={rows} columns={columns} />
        </CardContent>
      </Card>
    </div>
  );
}

/** The dashboard: title, indicators, the activity chart and two cards. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true" aria-label="Carregando">
      <HeaderSkeleton />
      <StatsSkeleton count={4} />
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** A record's page: name with avatar, tabs, and a card of fields. */
export function DetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true" aria-label="Carregando">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-9 w-80 max-w-full" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-48" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Messages of a conversation that is opening: the shape of a question and its answer. */
export function MessagesSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6" aria-busy="true" aria-label="Carregando a conversa">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-6">
          <Skeleton className="h-10 w-2/5 self-end rounded-3xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The chat page: conversation list, header with the model, thread and composer. */
export function ChatPageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Carregando o assistente">
      <div className="hidden w-(--sidebar-width) shrink-0 flex-col gap-2 border-r bg-sidebar p-2 md:flex">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex-1">
          <MessagesSkeleton />
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
