"use client";

import Link from "next/link";
import { Bot, ChevronRight, Cog, ScrollText, ShieldCheck, ShieldX } from "lucide-react";
import { AGENT_NAME } from "@/core/brand";
import type { AdministratorStatus, AuditEventView } from "@/core/api/types";
import type { NavItem } from "@/core/shell/navigation";
import { EmptyState, ErrorState } from "@/core/ui/feedback";
import { formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { actionLabel } from "@/core/audit/labels";

/** Rows placeholder while a card loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <CardAction>
      <Button variant="ghost" size="sm" asChild>
        <Link href={href}>
          {label}
          <ChevronRight data-icon="inline-end" />
        </Link>
      </Button>
    </CardAction>
  );
}

/** Account health: administrators against the minimum, accounts without a second factor, failed sign-ins today. */
export function SecurityCard({
  administrators,
  accounts,
  failuresToday,
  error,
  onRetry,
}: {
  administrators: AdministratorStatus | null | undefined;
  /** Active accounts and how many of them have no second factor (counts from the API). */
  accounts: { active: number; withoutMfa: number } | null | undefined;
  failuresToday: number | null | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const loading = accounts === null || administrators === null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança</CardTitle>
        <CardDescription>Pontos que merecem atenção agora.</CardDescription>
        {accounts !== undefined && <SeeAll href="/settings/users" label="Usuários" />}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="p-4" />
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            {administrators && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Administradores ativos</span>
                  <span className="text-muted-foreground tabular-nums">
                    {administrators.active} de {administrators.minimum} no mínimo
                  </span>
                </div>
                <Progress
                  value={Math.min(100, (administrators.active / Math.max(administrators.minimum, 1)) * 100)}
                  aria-label="Administradores ativos em relação ao mínimo"
                />
                {administrators.belowMinimum && (
                  <p className="text-xs text-destructive">Promova mais uma pessoa de confiança a administrador.</p>
                )}
              </div>
            )}
            <ItemGroup className="gap-2">
              {accounts && (
                <Item variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <ShieldCheck />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Sem verificação em duas etapas</ItemTitle>
                    <ItemDescription>De {accounts.active} contas ativas</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={accounts.withoutMfa > 0 ? "destructive" : "secondary"} className="tabular-nums">
                      {accounts.withoutMfa}
                    </Badge>
                  </ItemActions>
                </Item>
              )}
              {failuresToday !== undefined && (
                <Item variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <ShieldX />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Logins com falha hoje</ItemTitle>
                    <ItemDescription>Senha errada ou conta inexistente</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {failuresToday === null ? (
                      <Skeleton className="h-5 w-8" />
                    ) : (
                      <Badge variant={failuresToday > 0 ? "destructive" : "secondary"} className="tabular-nums">
                        {failuresToday}
                      </Badge>
                    )}
                  </ItemActions>
                </Item>
              )}
            </ItemGroup>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActorAvatar({ event }: { event: AuditEventView }) {
  if (event.origin === "AI_TOOL" || event.origin === "SYSTEM") {
    return (
      <Avatar className="size-8">
        <AvatarFallback>{event.origin === "AI_TOOL" ? <Bot className="size-4" /> : <Cog className="size-4" />}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <Avatar className="size-8">
      <AvatarFallback className="text-xs">{initials(event.actorEmail ?? "?")}</AvatarFallback>
    </Avatar>
  );
}

/** Latest audit entries in plain words. */
export function RecentActivityCard({
  events,
  error,
  onRetry,
}: {
  events: AuditEventView[] | null;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>O que aconteceu por último no portal.</CardDescription>
        <SeeAll href="/settings/audit" label="Auditoria" />
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="p-4" />
        ) : !events ? (
          <ListSkeleton />
        ) : events.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nenhum evento ainda"
            description="As ações feitas no portal aparecem aqui."
            className="p-4"
          />
        ) : (
          <ItemGroup>
            {events.map((event, index) => (
              <div key={event.id}>
                {index > 0 && <ItemSeparator />}
                <Item size="sm" className="px-0">
                  <ItemMedia>
                    <ActorAvatar event={event} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full min-w-0"><span className="truncate">{actionLabel(event.action)}</span></ItemTitle>
                    <ItemDescription className="truncate">
                      {event.origin === "AI_TOOL"
                        ? `${AGENT_NAME}, a pedido de ${event.actorEmail ?? "alguém"}`
                        : (event.actorEmail ?? "Sistema")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {formatRelative(event.occurredAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{formatDateTime(event.occurredAt)}</TooltipContent>
                    </Tooltip>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

/** Every screen the user may open, as a row of shortcuts. */
export function QuickAccessCard({ items }: { items: NavItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso rápido</CardTitle>
        <CardDescription>As áreas que suas permissões liberam.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <Item key={item.href} variant="outline" size="sm" asChild>
              <Link href={item.href}>
                <ItemMedia variant="icon">
                  <item.icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{item.label}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="size-4" />
                </ItemActions>
              </Link>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
