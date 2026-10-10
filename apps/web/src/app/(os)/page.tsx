"use client";

import type { LucideIcon } from "lucide-react";
import {
  KeyRound,
  LogIn,
  ShieldAlert,
  ShieldX,
  Smartphone,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { api } from "@/core/api/client";
import { fetchCursorPage, fetchPage, toQuery, type QueryValue } from "@/core/api/query";
import { useLoad } from "@/core/api/useLoad";
import type { AdministratorStatus, AuditActivityDay, AuditEventView, UserSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { navigationFor } from "@/core/shell/navigation";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { ActivityChart } from "./_dashboard/ActivityChart";
import { QuickAccessCard, RecentActivityCard, SecurityCard } from "./_dashboard/cards";
import { moduleDashboard } from "@/modules/dashboard";

const TODAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

interface Stat {
  key: string;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode | null;
  badge?: React.ReactNode;
  hint: string;
}

function sum(days: AuditActivityDay[], pick: (day: AuditActivityDay) => number) {
  return days.reduce((total, day) => total + pick(day), 0);
}

/** Change against the previous period, as the badge of the reference's metric cards. */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return current > 0 ? <Badge variant="outline">Novo</Badge> : null;
  const change = Math.round(((current - previous) / previous) * 100);
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <Badge variant="outline">
      <Icon />
      {change > 0 ? "+" : ""}
      {change}%
    </Badge>
  );
}

const RECENT_EVENTS = 6;

/** How many users match: a one-row page, read for its total. */
function countUsers(filter: Record<string, QueryValue>, signal: AbortSignal): Promise<number> {
  return fetchPage<UserSummary>(`/api/iam/users${toQuery({ ...filter, size: 1 })}`, signal).then((page) => page.page.totalElements);
}

/** A load that runs only with the permission; without it resolves to `undefined` so the block hides. */
function when<T>(
  allowed: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): (signal: AbortSignal) => Promise<T | undefined> {
  return allowed ? load : () => Promise.resolve(undefined);
}

export default function DashboardPage() {
  const { me, hasPermission } = useAuth();
  const mayAudit = hasPermission("audit.event.read");
  const mayUsers = hasPermission("iam.user.read");
  const widgets = moduleDashboard.filter((widget) => hasPermission(widget.permission));
  const moduleStats = widgets.flatMap((widget) => (widget.stat ? [widget.stat] : []));
  const moduleCards = widgets.flatMap((widget) => (widget.card ? [widget.card] : []));
  const moduleCharts = widgets.flatMap((widget) => (widget.chart ? [widget.chart] : []));
  const moduleHeroes = widgets.flatMap((widget) => (widget.hero ? [widget.hero] : []));
  // A module with a hero owns the dashboard: the portal's security, activity and shortcut cards step aside.
  const focused = moduleHeroes.length > 0;
  const moduleStatCount = moduleStats.length;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const activity = useLoad(
    when(mayAudit, (signal) =>
      api<AuditActivityDay[]>(`/api/audit/activity?days=90&zone=${encodeURIComponent(zone)}`, { signal }),
    ),
  );
  const events = useLoad(
    when(mayAudit, (signal) =>
      fetchCursorPage<AuditEventView>(`/api/audit/events${toQuery({ size: RECENT_EVENTS })}`, signal),
    ),
  );
  // Counts only: one-row pages whose totals the API computes, never the whole users list.
  const people = useLoad(
    when(mayUsers, (signal) =>
      Promise.all([
        countUsers({ state: "ACTIVE" }, signal),
        countUsers({ state: "ACTIVE", mfa: false }, signal),
        api<AdministratorStatus>("/api/iam/users/administrators", { signal }),
      ]).then(([active, withoutMfa, administrators]) => ({ accounts: { active, withoutMfa }, administrators })),
    ),
  );

  const days = activity.data ?? null;
  const accounts = people.data?.accounts ?? null;

  // Cheap to rebuild on every render; no memo needed.
  const stats: Stat[] = (() => {
    const list: Stat[] = [];
    if (mayAudit) {
      const last7 = days?.slice(-7) ?? [];
      const previous7 = days?.slice(-14, -7) ?? [];
      const logins = days && sum(last7, (d) => d.loginSuccess);
      const failures = days && sum(last7, (d) => d.loginFailure);
      list.push({
        key: "logins",
        icon: LogIn,
        label: "Logins em 7 dias",
        value: activity.error ? "-" : logins,
        badge: days && <Trend current={logins ?? 0} previous={sum(previous7, (d) => d.loginSuccess)} />,
        hint: activity.error ? "Não foi possível carregar" : "Comparado aos 7 dias anteriores",
      });
      list.push({
        key: "failures",
        icon: ShieldX,
        label: "Logins com falha em 7 dias",
        value: activity.error ? "-" : failures,
        badge: days && (failures ? <Badge variant="destructive">Verifique</Badge> : <Badge variant="secondary">Nenhuma</Badge>),
        hint: "Senha errada ou conta inexistente",
      });
    }
    if (mayUsers) {
      const withoutMfa = accounts?.withoutMfa ?? 0;
      list.push({
        key: "users",
        icon: Users,
        label: "Contas ativas",
        value: people.error ? "-" : (accounts?.active ?? null),
        badge:
          accounts &&
          (withoutMfa > 0 ? (
            <Badge variant="destructive">
              <ShieldAlert />
              {withoutMfa} sem duas etapas
            </Badge>
          ) : (
            <Badge variant="secondary">Todas protegidas</Badge>
          )),
        hint: people.error ? "Não foi possível carregar" : "Contas com acesso ao portal",
      });
    }
    // Personal cards fill the row when the account cannot see portal-wide numbers.
    const personal: Stat[] = [
      {
        key: "mfa",
        icon: Smartphone,
        label: "Sua verificação em duas etapas",
        value: me.mfa.enabled ? "Ativa" : "Inativa",
        badge: !me.mfa.enabled && <Badge variant="destructive">Recomendado</Badge>,
        hint: me.mfa.enabled ? "Um código é pedido a cada login" : "Ative em Configurações › Segurança",
      },
      {
        key: "roles",
        icon: UserCog,
        label: "Suas roles",
        value: me.roles.length,
        hint: me.roles.length ? me.roles.join(", ") : "Peça acesso a um administrador",
      },
      {
        key: "permissions",
        icon: KeyRound,
        label: "Suas permissões",
        value: me.permissions.length,
        hint: "No portal e pelo assistente",
      },
    ];
    for (const card of personal) if (list.length + moduleStatCount < 4) list.push(card);
    return list;
  })();

  // A full row of module indicators takes the place of the portal's own numbers.
  const portalStats = moduleStatCount >= 4 ? 0 : (mayAudit ? 2 : 0) + (mayUsers ? 1 : 0);
  const shortcuts = navigationFor(hasPermission)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== "/");
  const failuresToday = days ? (days.at(-1)?.loginFailure ?? 0) : null;

  return (
    <>
      <PageHeader
        title={`Olá, ${me.name.split(" ")[0]}`}
        description={`${TODAY.format(new Date()).replace(/^./, (c) => c.toUpperCase())} · ${focused ? "O que foi combinado com cada cliente e ainda não tem dono" : "Visão geral do portal"}`}
      />

      <StatGrid>
        {/* Portal-wide numbers, then the modules' indicators, then the personal cards that fill the row. */}
        {stats.slice(0, portalStats).map(({ key, ...card }) => (
          <StatCard key={key} {...card} />
        ))}
        {moduleStats.map((Stat, index) => (
          <Stat key={index} />
        ))}
        {stats.slice(moduleStatCount >= 4 ? stats.length : portalStats).map(({ key, ...card }) => (
          <StatCard key={key} {...card} />
        ))}
      </StatGrid>

      {moduleHeroes.map((Hero, index) => (
        <Hero key={index} />
      ))}

      {mayAudit && moduleCharts.length === 0 && !focused && (
        <ActivityChart days={days} error={activity.error} onRetry={activity.retry} />
      )}

      {(mayUsers || moduleCards.length > 0 || moduleCharts.length > 0 || mayAudit) && (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {moduleCharts.map((Chart, index) => (
            <Chart key={index} />
          ))}
          {moduleCards.map((Card, index) => (
            <Card key={index} />
          ))}
          {!focused && (mayUsers || mayAudit) && (
            <SecurityCard
              administrators={mayUsers ? (people.data?.administrators ?? null) : undefined}
              accounts={mayUsers ? accounts : undefined}
              failuresToday={mayAudit ? failuresToday : undefined}
              error={people.error}
              onRetry={people.retry}
            />
          )}
          {!focused && mayAudit && (
            <RecentActivityCard
              events={events.data ? events.data.content : null}
              error={events.error}
              onRetry={events.retry}
            />
          )}
        </div>
      )}

      {!focused && <QuickAccessCard items={shortcuts} />}
    </>
  );
}
