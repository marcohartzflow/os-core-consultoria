"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Bot,
  CalendarRange,
  Cog,
  Download,
  Filter,
  MousePointerClick,
  ScrollText,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { AGENT_NAME } from "@/core/brand";
import { api, download, isAbortError } from "@/core/api/client";
import { fetchPage, toQuery, type QueryValue } from "@/core/api/query";
import { actionLabel } from "@/core/audit/labels";
import { DataTableCard, DataTableCardFooter, DataTableCardHeader } from "@/core/ui/data-table/DataTableCard";
import type { AuditEventView, AuditOrigin, UserSummary } from "@/core/api/types";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import {
  DataTable,
  DataTableColumnHeader,
  DataTableCursorPagination,
  DataTableFacetedFilter,
  DataTableResetFilters,
  DataTableViewOptions,
  type FacetOption,
} from "@/core/ui/data-table/DataTable";
import type { DataTableColumnDef } from "@/core/ui/data-table/features";
import { useServerTable } from "@/core/ui/data-table/useServerTable";
import { EmptyState, ErrorState, notifyError, TableSkeleton } from "@/core/ui/feedback";
import { formatDate, formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ORIGINS: { value: AuditOrigin; label: string; icon: LucideIcon }[] = [
  { value: "REST", label: "Portal", icon: MousePointerClick },
  { value: "AI_TOOL", label: AGENT_NAME, icon: Bot },
  { value: "SYSTEM", label: "Sistema", icon: Cog },
];

const ORIGIN_OPTIONS: FacetOption[] = ORIGINS.map(({ value, label, icon }) => ({ value, label, icon }));

/** Single-value filters kept in the URL; from and to are local days (YYYY-MM-DD), to inclusive. */
const SCALARS = ["action", "actorEmail", "actorId", "entityType", "entityId", "correlationId", "from", "to"] as const;

/** Rows of one CSV export (AuditQueryService.EXPORT_LIMIT); the newest ones when more match. */
const EXPORT_LIMIT = 10_000;

/** Shortest "e-mail contains" text the API accepts: fewer letters cannot use its trigram index. */
const MIN_EMAIL_TEXT = 3;

const COLUMN_LABELS: Record<string, string> = { entity: "Entidade", ip: "IP" };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(days: number): Date {
  const day = startOfDay(new Date());
  day.setDate(day.getDate() - days);
  return day;
}

/** Local day as it goes in the URL. */
function toDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDay(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * URL filters to API parameters. The period covers whole local days: from its first midnight to
 * the midnight after its last day (the API end is exclusive).
 */
function auditParams(origins: string[], scalars: Record<string, string>): Record<string, QueryValue> {
  const from = fromDay(scalars.from ?? "");
  const last = fromDay(scalars.to ?? "") ?? from;
  const end = last ? startOfDay(last) : undefined;
  end?.setDate(end.getDate() + 1);
  return {
    origin: origins,
    action: scalars.action?.trim() || undefined,
    actorEmail: scalars.actorEmail?.trim() || undefined,
    actorId: scalars.actorId?.trim() || undefined,
    entityType: scalars.entityType?.trim() || undefined,
    entityId: scalars.entityId?.trim() || undefined,
    correlationId: scalars.correlationId?.trim() || undefined,
    from: from ? startOfDay(from).toISOString() : undefined,
    to: end?.toISOString(),
  };
}

function OriginBadge({ origin }: { origin: AuditOrigin }) {
  const meta = ORIGINS.find((o) => o.value === origin) ?? ORIGINS[0];
  return (
    <Badge variant={origin === "AI_TOOL" ? "secondary" : "outline"}>
      <meta.icon />
      {meta.label}
    </Badge>
  );
}

function Actor({ event }: { event: AuditEventView }) {
  if (!event.actorEmail) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Avatar className="size-8">
          <AvatarFallback>
            <Cog className="size-4" />
          </AvatarFallback>
        </Avatar>
        Sistema
      </div>
    );
  }
  return (
    <div className="flex min-w-44 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback>{initials(event.actorEmail.split("@")[0].replace(/[._-]+/g, " "))}</AvatarFallback>
      </Avatar>
      <span className="truncate">{event.actorEmail}</span>
    </div>
  );
}

function When({ iso }: { iso: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="whitespace-nowrap">
          {formatRelative(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(iso)}</TooltipContent>
    </Tooltip>
  );
}

export default function AuditPage() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<AuditEventView | null>(null);

  const columns = useMemo<DataTableColumnDef<AuditEventView>[]>(
    () => [
      {
        id: "occurredAt",
        accessorFn: (event) => event.occurredAt,
        header: "Quando",
        cell: ({ row }) => <When iso={row.original.occurredAt} />,
        enableHiding: false,
      },
      {
        id: "actor",
        accessorFn: (event) => event.actorEmail ?? "",
        enableSorting: false,
        enableHiding: false,
        header: "Quem",
        cell: ({ row }) => (
          <div className="max-w-64">
            <Actor event={row.original} />
          </div>
        ),
      },
      {
        id: "origin",
        accessorFn: (event) => event.origin,
        enableSorting: false,
        enableHiding: false,
        header: "Origem",
        cell: ({ row }) => <OriginBadge origin={row.original.origin} />,
      },
      {
        id: "action",
        accessorFn: (event) => event.action,
        enableHiding: false,
        header: "Ação",
        cell: ({ row }) => (
          <Button
            variant="link"
            className="grid h-auto min-w-44 justify-items-start gap-0.5 p-0 text-left font-normal whitespace-normal text-foreground"
            aria-label={`Ver detalhes de ${actionLabel(row.original.action)}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(row.original);
            }}
          >
            <span className="font-medium">{actionLabel(row.original.action)}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.action}</span>
          </Button>
        ),
      },
      {
        id: "entity",
        accessorFn: (event) => event.entityType ?? "",
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Entidade" />,
        cell: ({ row }) =>
          row.original.entityType ? (
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.entityType}
              {row.original.entityId && ` · ${row.original.entityId.slice(0, 8)}`}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "ip",
        accessorFn: (event) => event.ip ?? "",
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="IP" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ip ?? "—"}</span>,
      },
    ],
    [],
  );

  const {
    table,
    page,
    cursor,
    error,
    loading,
    retry,
    filtered,
    clearFilters,
    values,
    drafts,
    setDraft,
    setValues,
  } = useServerTable({
    // Always newest first: the trail pages by position along that one order (see AuditQueryService).
    sortable: [],
    cursor: true,
    path: "/api/audit/events",
    columns,
    filters: ["origin"],
    scalars: SCALARS,
    toParams: (filters, scalars) => auditParams(filters.origin, scalars),
    pageSize: 50,
    getRowId: (event) => event.id,
  });

  const range: DateRange | undefined = fromDay(values.from)
    ? { from: fromDay(values.from), to: fromDay(values.to) ?? fromDay(values.from) }
    : undefined;
  const exportQuery = toQuery(auditParams(params.getAll("origin"), values));
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      await download(`/api/audit/events.csv${exportQuery}`, "text/csv", "auditoria.csv");
    } catch (e) {
      notifyError(e, "Não foi possível exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Quem fez o quê e quando, no portal e pelo assistente. Registro append-only."
        actions={
          <RequirePermission permission="audit.event.export">
            <Button variant="outline" disabled={exporting} onClick={() => void exportCsv()}>
              {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {cursor && !cursor.totalExact
                ? `Exportar CSV (${EXPORT_LIMIT.toLocaleString("pt-BR")} mais recentes)`
                : "Exportar CSV"}
            </Button>
          </RequirePermission>
        }
      />

      <DataTableCard>
        <DataTableCardHeader>
          <CardTitle className="text-xl leading-none">Eventos</CardTitle>
          <CardDescription>Os filtros se aplicam enquanto você digita. Clique num evento para ver tudo.</CardDescription>
          <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-56">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Ação (prefixo)"
                  placeholder="Ação, ex.: iam.user"
                  className="font-mono text-xs"
                  maxLength={100}
                  value={drafts.action ?? ""}
                  onChange={(e) => setDraft("action", e.target.value)}
                />
              </InputGroup>
              <ActorFilter
                actorId={values.actorId}
                actorEmail={values.actorEmail}
                onChange={(patch) => setValues({ actorId: "", actorEmail: "", ...patch })}
              />
              <InputGroup className="w-full sm:w-36">
                <InputGroupInput
                  aria-label="Tipo de entidade"
                  placeholder="Entidade"
                  maxLength={100}
                  value={drafts.entityType ?? ""}
                  onChange={(e) => setDraft("entityType", e.target.value)}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("origin")} title="Origem" options={ORIGIN_OPTIONS} />
              <RangeFilter
                value={range}
                onChange={(next) =>
                  setValues({
                    from: next?.from ? toDay(next.from) : "",
                    to: next?.to ? toDay(next.to) : next?.from ? toDay(next.from) : "",
                  })
                }
              />
              {(values.entityId || values.correlationId) && (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Remover filtro de entidade ou correlação"
                  onClick={() => setValues({ entityId: "", correlationId: "" })}
                >
                  <Filter data-icon="inline-start" />
                  {values.correlationId ? "Mesma requisição" : `Id ${values.entityId.slice(0, 8)}…`}
                  <X data-icon="inline-end" />
                </Button>
              )}
              <DataTableResetFilters visible={filtered} onReset={clearFilters} />
            </div>
            <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
          </div>
        </DataTableCardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !page ? (
            <TableSkeleton rows={8} columns={5} />
          ) : page.page.totalElements === 0 && !filtered ? (
            <EmptyState
              icon={ScrollText}
              title="Nenhum evento ainda"
              description="Logins, mudanças de acesso e ações do assistente aparecem aqui."
            />
          ) : (
            <DataTable
              table={table}
              loading={loading}
              onRowClick={setSelected}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhum evento encontrado"
                  description="Nenhum registro atende aos filtros escolhidos."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  }
                />
              }
            />
          )}
        </CardContent>
        {cursor && cursor.total > 0 && !error && (
          <DataTableCardFooter>
            <DataTableCursorPagination cursor={cursor} noun={["evento", "eventos"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>
      <span className="sr-only" aria-live="polite">
        {cursor ? `${cursor.totalExact ? "" : "Mais de "}${cursor.total} eventos encontrados` : ""}
      </span>

      <EventSheet
        event={selected}
        onClose={() => setSelected(null)}
        onFilter={(patch) => {
          setSelected(null);
          setValues(patch, { reset: true });
        }}
      />
    </>
  );
}

/**
 * "Who" filter. Picking a person filters by id (index on actor_id, exact: ana@ does not bring
 * joana@). Typed text of at least 3 characters can also filter by "e-mail contains", for addresses
 * without an account (sign-in attempts). The people list needs iam.user.read; without it only the
 * e-mail option is offered.
 */
function ActorFilter({
  actorId,
  actorEmail,
  onChange,
}: {
  actorId: string;
  actorEmail: string;
  onChange: (patch: { actorId?: string; actorEmail?: string }) => void;
}) {
  const { hasPermission } = useAuth();
  const mayListPeople = hasPermission("iam.user.read");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<UserSummary[]>([]);
  const [chosen, setChosen] = useState<UserSummary | null>(null);
  // A search is on its way (set on typing, so stale results never pass for the answer), or failed.
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // People matching the text, after a pause in typing; the newest answer wins.
  useEffect(() => {
    if (!open || !mayListPeople) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPage<UserSummary>(`/api/iam/users${toQuery({ q: text.trim() || undefined, size: 8, sort: "name" })}`, controller.signal).then(
        (page) => {
          setPeople(page.content);
          setFailed(false);
          setSearching(false);
        },
        (e: unknown) => {
          if (isAbortError(e)) return;
          setPeople([]);
          setFailed(true);
          setSearching(false);
        },
      );
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, text, mayListPeople, attempt]);

  // A person in the URL (a link, "events of this person"): show the name, not the id.
  useEffect(() => {
    if (!actorId || !mayListPeople || chosen?.id === actorId) return;
    let current = true;
    api<UserSummary>(`/api/iam/users/${encodeURIComponent(actorId)}`).then(
      (user) => current && setChosen(user),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [actorId, mayListPeople, chosen?.id]);

  const trimmed = text.trim();
  const label = actorId
    ? chosen?.id === actorId
      ? chosen.name
      : "Pessoa escolhida"
    : actorEmail
      ? `E-mail contém “${actorEmail}”`
      : "Quem";
  const active = !!(actorId || actorEmail);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && mayListPeople) setSearching(true);
      }}
    >
      <div className="flex items-center">
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={active ? "max-w-60 border-solid" : "border-dashed"}>
            <UserRound data-icon="inline-start" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        {active && (
          <Button variant="ghost" size="icon-sm" aria-label="Remover filtro de quem agiu" onClick={() => onChange({})}>
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-72 p-0" align="start">
        {/* The API filters; the list shows what it answered, in its order. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={mayListPeople ? "Nome ou e-mail…" : "Parte do e-mail…"}
            value={text}
            onValueChange={(next) => {
              setText(next);
              if (mayListPeople) setSearching(true);
            }}
            maxLength={320}
          />
          <CommandList>
            {!searching && !failed && (
              <CommandEmpty>
                {trimmed.length < MIN_EMAIL_TEXT ? "Digite ao menos 3 letras." : "Ninguém encontrado."}
              </CommandEmpty>
            )}
            {searching && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground" role="status">
                <Spinner className="size-3.5" />
                Buscando…
              </div>
            )}
            {failed && !searching && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-destructive">
                Não foi possível buscar as pessoas.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearching(true);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            {trimmed.length >= MIN_EMAIL_TEXT && (
              <CommandGroup heading="E-mail">
                <CommandItem
                  value={`email:${trimmed}`}
                  onSelect={() => {
                    onChange({ actorEmail: trimmed });
                    setOpen(false);
                  }}
                >
                  <AtSign />
                  <span className="truncate">E-mail contém “{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            )}
            {!searching && people.length > 0 && (
              <CommandGroup heading="Pessoas">
                {people.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={`person:${person.id}`}
                    onSelect={() => {
                      setChosen(person);
                      onChange({ actorId: person.id });
                      setOpen(false);
                    }}
                  >
                    <UserRound />
                    <div className="grid min-w-0">
                      <span className="truncate">{person.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{person.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PRESETS: { label: string; range: () => DateRange | undefined }[] = [
  { label: "Hoje", range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: "7 dias", range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { label: "30 dias", range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  { label: "Tudo", range: () => undefined },
];

function rangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Período";
  const from = formatDate(range.from.toISOString());
  if (!range.to || startOfDay(range.to).getTime() === startOfDay(range.from).getTime()) return from;
  return `${from} – ${formatDate(range.to.toISOString())}`;
}

function RangeFilter({
  value,
  onChange,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={value?.from ? "border-solid" : "border-dashed"}>
          <CalendarRange data-icon="inline-start" />
          {rangeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex gap-1 border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  onChange(preset.range());
                  setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={1}
            selected={value}
            onSelect={onChange}
            disabled={{ after: new Date() }}
            defaultMonth={value?.from}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
  );
}

function EventSheet({
  event,
  onClose,
  onFilter,
}: {
  event: AuditEventView | null;
  onClose: () => void;
  onFilter: (patch: Record<string, string>) => void;
}) {
  return (
    <Sheet open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        {event && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>{actionLabel(event.action)}</SheetTitle>
              <SheetDescription>
                <span className="font-mono">{event.action}</span> · {formatDateTime(event.occurredAt)} ·{" "}
                {formatRelative(event.occurredAt)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
              <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
                <Detail label="Quem">{event.actorEmail ?? "Sistema"}</Detail>
                <Detail label="Origem">
                  <OriginBadge origin={event.origin} />
                </Detail>
                <Detail label="Entidade">
                  <span className="font-mono text-xs">{event.entityType ?? "—"}</span>
                </Detail>
                <Detail label="Id da entidade">
                  <span className="font-mono text-xs">{event.entityId ?? "—"}</span>
                </Detail>
                <Detail label="IP">
                  <span className="font-mono text-xs">{event.ip ?? "—"}</span>
                </Detail>
                <Detail label="Correlação">
                  <span className="font-mono text-xs">{event.correlationId ?? "—"}</span>
                </Detail>
                <Detail label="Id do evento">
                  <span className="font-mono text-xs">{event.id}</span>
                </Detail>
              </dl>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Detalhes</span>
                {event.details ? (
                  <Textarea
                    readOnly
                    aria-label={`Detalhes de ${event.action}`}
                    className="min-h-40 font-mono text-xs"
                    value={JSON.stringify(event.details, null, 2)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Este evento não tem detalhes adicionais.</p>
                )}
              </div>
            </div>
            <SheetFooter className="border-t">
              {(event.actorId || event.actorEmail) && (
                <Button
                  variant="outline"
                  // By id when the event has one: the e-mail box matches part of an address, so
                  // ana@x.com would also bring joana@x.com. Sign-in failures of unknown addresses have no id.
                  onClick={() =>
                    onFilter(event.actorId ? { actorId: event.actorId } : { actorEmail: event.actorEmail ?? "" })
                  }
                >
                  <Filter data-icon="inline-start" />
                  Eventos desta pessoa
                </Button>
              )}
              {event.entityType && event.entityId && (
                <Button
                  variant="outline"
                  onClick={() => onFilter({ entityType: event.entityType ?? "", entityId: event.entityId ?? "" })}
                >
                  <Filter data-icon="inline-start" />
                  Eventos desta entidade
                </Button>
              )}
              {event.correlationId && (
                <Button variant="outline" onClick={() => onFilter({ correlationId: event.correlationId ?? "" })}>
                  <Filter data-icon="inline-start" />
                  Eventos da mesma requisição
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
