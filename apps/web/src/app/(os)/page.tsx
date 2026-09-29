"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bot, ChevronRight, KeyRound, Smartphone, UserCog, Users } from "lucide-react";
import { api } from "@/core/api/client";
import type { AdministratorStatus, AuditEventView, Paged, UserSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { navigationFor } from "@/core/shell/navigation";
import { formatDateTime } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";

function MetricCard({
  icon: Icon,
  label,
  value,
  badge,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  badge?: React.ReactNode;
  note: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Avatar className="size-8">
            <AvatarFallback className="text-muted-foreground">
              <Icon className="size-4" />
            </AvatarFallback>
          </Avatar>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl leading-none font-medium tracking-tight tabular-nums">{value}</div>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

interface Overview {
  users: UserSummary[] | null;
  administrators: AdministratorStatus | null;
  events: AuditEventView[] | null;
}

export default function DashboardPage() {
  const { me, hasPermission } = useAuth();
  const mayReadUsers = hasPermission("iam.user.read");
  const mayReadAudit = hasPermission("audit.event.read");
  const [overview, setOverview] = useState<Overview>({ users: null, administrators: null, events: null });

  useEffect(() => {
    let current = true;
    // Each block is optional: a failure or a missing permission only hides that block.
    Promise.all([
      mayReadUsers ? api<UserSummary[]>("/api/iam/users").catch(() => null) : null,
      mayReadUsers ? api<AdministratorStatus>("/api/iam/users/administrators").catch(() => null) : null,
      mayReadAudit ? api<Paged<AuditEventView>>("/api/audit/events").catch(() => null) : null,
    ]).then(([users, administrators, events]) => {
      if (current) setOverview({ users, administrators, events: events?.content.slice(0, 5) ?? null });
    });
    return () => {
      current = false;
    };
  }, [mayReadUsers, mayReadAudit]);

  const active = overview.users?.filter((u) => u.status === "ACTIVE" && !u.locked && !u.anonymizedAt).length;
  const invited = overview.users?.filter((u) => u.status === "INVITED").length ?? 0;
  const shortcuts = navigationFor(hasPermission)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== "/");

  return (
    <>
      <PageHeader title={`Olá, ${me.name.split(" ")[0]}`} description="Visão geral da sua conta e do portal." />
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <MetricCard
          icon={UserCog}
          label="Suas roles"
          value={me.roles.length}
          note={me.roles.length ? me.roles.join(", ") : "Peça acesso a um administrador"}
        />
        <MetricCard
          icon={KeyRound}
          label="Suas permissões"
          value={me.permissions.length}
          note="Ações que você pode executar, no portal e pelo assistente"
        />
        <MetricCard
          icon={Smartphone}
          label="Verificação em duas etapas"
          value={me.mfa.enabled ? "Ativa" : "Inativa"}
          badge={!me.mfa.enabled && <Badge variant="destructive">Recomendado</Badge>}
          note={me.mfa.enabled ? "Sua conta pede um código a cada login" : "Ative em Minha conta"}
        />
        {active !== undefined ? (
          <MetricCard
            icon={Users}
            label="Usuários ativos"
            value={active}
            badge={invited > 0 && <Badge variant="secondary">{invited} convidados</Badge>}
            note={
              overview.administrators
                ? `${overview.administrators.active} ${overview.administrators.active === 1 ? "administrador" : "administradores"}, mínimo ${overview.administrators.minimum}`
                : "Contas que podem entrar no portal"
            }
          />
        ) : (
          <MetricCard
            icon={Bot}
            label="Assistente"
            value={hasPermission("ai.chat.use") ? "Disponível" : "Sem acesso"}
            note={
              hasPermission("ai.chat.use")
                ? "Abra pelo botão Assistente no topo da tela"
                : "Peça acesso a um administrador"
            }
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Acesso rápido</CardTitle>
            <CardDescription>As áreas que suas permissões liberam.</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-2">
              {shortcuts.map((item) => (
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
              {shortcuts.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma área liberada ainda.</p>
              )}
            </ItemGroup>
          </CardContent>
        </Card>
        {overview.events && (
          <Card>
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Últimos eventos da auditoria.</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/settings/audit">
                    Ver tudo
                    <ChevronRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ItemGroup className="gap-2">
                {overview.events.map((event) => (
                  <Item key={event.id} size="sm">
                    <ItemContent>
                      <ItemTitle className="font-mono text-xs">{event.action}</ItemTitle>
                      <ItemDescription>{event.actorEmail ?? "sistema"}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                    </ItemActions>
                  </Item>
                ))}
                {overview.events.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento.</p>}
              </ItemGroup>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
