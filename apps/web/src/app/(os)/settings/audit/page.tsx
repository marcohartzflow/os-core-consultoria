"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Cog,
  Download,
  Filter,
  ListFilter,
  LogIn,
  MousePointerClick,
  ScrollText,
  Search,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import { api } from "@/core/api/client";
import type { AuditActivityDay, AuditEventView, AuditOrigin, Paged } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { RequirePermission } from "@/core/auth/AuthProvider";
import { EmptyState, ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { formatDate, formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Filter {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  origins: AuditOrigin[];
  range: DateRange | undefined;
}

const EMPTY_FILTER: Filter = {
  actorEmail: "",
  action: "",
  entityType: "",
  entityId: "",
  correlationId: "",
  origins: [],
  range: undefined,
};

const ORIGINS: { value: AuditOrigin; label: string; icon: LucideIcon }[] = [
  { value: "REST", label: "Portal", icon: MousePointerClick },
  { value: "AI_TOOL", label: "Assistente", icon: Bot },
  { value: "SYSTEM", label: "Sistema", icon: Cog },
];

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(days: number): Date {
  const day = startOfDay(new Date());
  day.setDate(day.getDate() - days);
  return day;
}

/** Filter to query string; the date range covers whole local days (end exclusive at the next midnight). */
function query(filter: Filter, page?: number): string {
  const params = new URLSearchParams();
  if (filter.actorEmail.trim()) params.set("actorEmail", filter.actorEmail.trim());
  if (filter.action.trim()) params.set("action", filter.action.trim());
  if (filter.entityType.trim()) params.set("entityType", filter.entityType.trim());
  if (filter.entityId.trim()) params.set("entityId", filter.entityId.trim());
  if (filter.correlationId.trim()) params.set("correlationId", filter.correlationId.trim());
  for (const origin of filter.origins) params.append("origin", origin);
  if (filter.range?.from) {
    params.set("from", startOfDay(filter.range.from).toISOString());
    const end = startOfDay(filter.range.to ?? filter.range.from);
    end.setDate(end.getDate() + 1);
    params.set("to", end.toISOString());
  }
  if (page) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

function isFiltered(filter: Filter): boolean {
  return query(filter) !== "";
}

/** Text typed into a box reaches the query only after the user pauses. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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
    <div className="flex min-w-0 items-center gap-3">
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
        <span className="whitespace-nowrap">{formatRelative(iso)}</span>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(iso)}</TooltipContent>
    </Tooltip>
  );
}

function sum(days: AuditActivityDay[] | null, pick: (day: AuditActivityDay) => number): number | null {
  return days ? days.reduce((total, day) => total + pick(day), 0) : null;
}

export default function AuditPage() {
  // Other screens link here pre-filtered (e.g. the activity tab of a user: ?entityId=…).
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => ({
    ...EMPTY_FILTER,
    actorEmail: params.get("actorEmail") ?? "",
    entityType: params.get("entityType") ?? "",
    entityId: params.get("entityId") ?? "",
  }));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEventView | null>(null);
  const [showEntity, setShowEntity] = useState(true);
  const [showIp, setShowIp] = useState(true);

  // Text boxes are debounced; origin, dates and buttons apply at once.
  const actorEmail = useDebounced(filter.actorEmail);
  const action = useDebounced(filter.action);
  const entityType = useDebounced(filter.entityType);
  const applied = useMemo<Filter>(
    () => ({ ...filter, actorEmail, action, entityType }),
    [filter, actorEmail, action, entityType],
  );
  const search = query(applied, page);

  const events = useLoad(() => api<Paged<AuditEventView>>(`/api/audit/events${search}`), search);
  const activity = useLoad(() =>
    api<AuditActivityDay[]>(`/api/audit/activity?days=7&zone=${encodeURIComponent(TIME_ZONE)}`),
  );

  function update(patch: Partial<Filter>) {
    setFilter((current) => ({ ...current, ...patch }));
    setPage(0);
  }

  function clear() {
    setFilter(EMPTY_FILTER);
    setPage(0);
  }

  const result = events.data;
  const days = activity.error ? null : activity.data;
  const failures = sum(days, (d) => d.loginFailure);
  const statValue = (value: number | null) => (activity.error ? "—" : value);
  const statHint = (text: string) => (activity.error ? "Não foi possível carregar" : text);
  const totalPages = Math.max(result?.page.totalPages ?? 1, 1);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Quem fez o quê e quando, no portal e pelo assistente. Registro append-only."
        actions={
          <RequirePermission permission="audit.event.export">
            <Button variant="outline" asChild>
              <a href={`/api/audit/events.csv${query(applied)}`} download>
                <Download />
                Exportar CSV
              </a>
            </Button>
          </RequirePermission>
        }
      />

      <StatGrid>
        <StatCard
          icon={Activity}
          label="Eventos em 7 dias"
          value={statValue(sum(days, (d) => d.rest + d.aiTool + d.system))}
          hint={statHint("Tudo o que foi registrado na semana")}
        />
        <StatCard
          icon={LogIn}
          label="Logins com sucesso"
          value={statValue(sum(days, (d) => d.loginSuccess))}
          hint={statHint("Entradas no portal em 7 dias")}
        />
        <StatCard
          icon={ShieldAlert}
          label="Logins falhos"
          value={statValue(failures)}
          hint={statHint("Senha errada ou conta bloqueada")}
          badge={
            failures === null ? undefined : failures > 0 ? (
              <Badge variant="destructive">Atenção</Badge>
            ) : (
              <Badge variant="secondary">Nenhum</Badge>
            )
          }
        />
        <StatCard
          icon={Bot}
          label="Ações do assistente"
          value={statValue(sum(days, (d) => d.aiTool))}
          hint={statHint("Ferramentas executadas pelo agente")}
        />
      </StatGrid>

      <Card>
        <CardHeader className="border-b">
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
                  value={filter.action}
                  onChange={(e) => update({ action: e.target.value })}
                />
              </InputGroup>
              <InputGroup className="w-full sm:w-52">
                <InputGroupInput
                  aria-label="E-mail de quem agiu"
                  placeholder="Quem (e-mail)"
                  maxLength={320}
                  value={filter.actorEmail}
                  onChange={(e) => update({ actorEmail: e.target.value })}
                />
              </InputGroup>
              <InputGroup className="w-full sm:w-36">
                <InputGroupInput
                  aria-label="Tipo de entidade"
                  placeholder="Entidade"
                  maxLength={100}
                  value={filter.entityType}
                  onChange={(e) => update({ entityType: e.target.value })}
                />
              </InputGroup>
              <OriginFilter value={filter.origins} onChange={(origins) => update({ origins })} />
              <RangeFilter value={filter.range} onChange={(range) => update({ range })} />
              {(filter.entityId || filter.correlationId) && (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Remover filtro de entidade ou correlação"
                  onClick={() => update({ entityId: "", correlationId: "" })}
                >
                  <Filter data-icon="inline-start" />
                  {filter.correlationId ? "Mesma requisição" : `Id ${filter.entityId.slice(0, 8)}…`}
                  <X data-icon="inline-end" />
                </Button>
              )}
              {isFiltered(filter) && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  Limpar
                  <X data-icon="inline-end" />
                </Button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden lg:flex">
                  <Settings2 data-icon="inline-start" />
                  Colunas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showEntity}
                  onCheckedChange={(v) => setShowEntity(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  Entidade
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showIp}
                  onCheckedChange={(v) => setShowIp(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  IP
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {events.error ? (
            <ErrorState error={events.error} onRetry={events.retry} />
          ) : !result ? (
            <TableSkeleton rows={8} columns={5} />
          ) : result.content.length === 0 ? (
            isFiltered(applied) ? (
              <EmptyState
                icon={Search}
                title="Nenhum evento encontrado"
                description="Nenhum registro atende aos filtros escolhidos."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ScrollText}
                title="Nenhum evento ainda"
                description="Logins, mudanças de acesso e ações do assistente aparecem aqui."
              />
            )
          ) : (
            <Table className="**:data-[slot=table-cell]:px-(--card-spacing) **:data-[slot=table-head]:px-(--card-spacing)">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 text-muted-foreground">Quando</TableHead>
                  <TableHead className="h-11 text-muted-foreground">Quem</TableHead>
                  <TableHead className="h-11 text-muted-foreground">Origem</TableHead>
                  <TableHead className="h-11 text-muted-foreground">Ação</TableHead>
                  {showEntity && <TableHead className="h-11 text-muted-foreground">Entidade</TableHead>}
                  {showIp && <TableHead className="h-11 text-muted-foreground">IP</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.content.map((event) => (
                  <TableRow key={event.id} className="cursor-pointer" onClick={() => setSelected(event)}>
                    <TableCell className="py-3">
                      <When iso={event.occurredAt} />
                    </TableCell>
                    <TableCell className="max-w-64 py-3">
                      <Actor event={event} />
                    </TableCell>
                    <TableCell className="py-3">
                      <OriginBadge origin={event.origin} />
                    </TableCell>
                    <TableCell className="py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 font-mono text-xs"
                        aria-label={`Ver detalhes de ${event.action}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(event);
                        }}
                      >
                        {event.action}
                      </Button>
                    </TableCell>
                    {showEntity && (
                      <TableCell className="py-3 text-muted-foreground">
                        {event.entityType ? (
                          <span className="font-mono text-xs">
                            {event.entityType}
                            {event.entityId && ` · ${event.entityId.slice(0, 8)}`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {showIp && (
                      <TableCell className="py-3 font-mono text-xs text-muted-foreground">{event.ip ?? "—"}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {result && !events.error && result.content.length > 0 && (
          <CardFooter className="flex flex-col gap-3 border-t text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground tabular-nums">
              {result.page.totalElements} {result.page.totalElements === 1 ? "registro" : "registros"} · página{" "}
              {result.page.number + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Primeira página"
                disabled={page === 0}
                onClick={() => setPage(0)}
              >
                <ChevronsLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Página anterior"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Próxima página"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Última página"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(totalPages - 1)}
              >
                <ChevronsRight />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
      <span className="sr-only" aria-live="polite">
        {result ? `${result.page.totalElements} eventos encontrados` : ""}
      </span>

      <EventSheet
        event={selected}
        onClose={() => setSelected(null)}
        onFilter={(patch) => {
          setSelected(null);
          setFilter({ ...EMPTY_FILTER, ...patch });
          setPage(0);
        }}
      />
    </>
  );
}

function OriginFilter({ value, onChange }: { value: AuditOrigin[]; onChange: (origins: AuditOrigin[]) => void }) {
  const selected = new Set(value);
  function toggle(origin: AuditOrigin) {
    const next = new Set(selected);
    if (next.has(origin)) next.delete(origin);
    else next.add(origin);
    onChange(ORIGINS.map((o) => o.value).filter((o) => next.has(o)));
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={selected.size > 0 ? "border-solid" : "border-dashed"}>
          <ListFilter data-icon="inline-start" />
          Origem
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              {ORIGINS.filter((o) => selected.has(o.value)).map((o) => (
                <Badge variant="secondary" key={o.value}>
                  {o.label}
                </Badge>
              ))}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Origem</DropdownMenuLabel>
        <DropdownMenuGroup>
          {ORIGINS.map((origin) => (
            <DropdownMenuCheckboxItem
              key={origin.value}
              checked={selected.has(origin.value)}
              onCheckedChange={() => toggle(origin.value)}
              onSelect={(e) => e.preventDefault()}
            >
              <origin.icon className="text-muted-foreground" />
              {origin.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center" onSelect={() => onChange([])}>
              Limpar filtro
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  onFilter: (patch: Partial<Filter>) => void;
}) {
  return (
    <Sheet open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        {event && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="font-mono text-base">{event.action}</SheetTitle>
              <SheetDescription>
                {formatDateTime(event.occurredAt)} · {formatRelative(event.occurredAt)}
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
              {event.actorEmail && (
                <Button variant="outline" onClick={() => onFilter({ actorEmail: event.actorEmail ?? "" })}>
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
