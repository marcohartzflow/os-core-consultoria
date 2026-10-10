"use client";

import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  FileText,
  Filter,
  Handshake,
  Hourglass,
  Mail,
  MessageCircle,
  Percent,
  Phone,
  Plus,
  Search,
  StickyNote,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState, notifyError, notifySuccess } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ComercialView, Negocio, Origem, TipoAtividade } from "./types";
import { ago, brl, brlShort, pct, Pessoa } from "./ui";

const ORIGEM_DOT: Record<Origem, string> = {
  Indicação: "bg-emerald-500",
  LinkedIn: "bg-sky-500",
  Site: "bg-violet-500",
  Evento: "bg-amber-500",
  "Cliente atual": "bg-primary",
};

const ATIVIDADE: Record<TipoAtividade, { icon: LucideIcon; label: string }> = {
  REUNIAO: { icon: CalendarDays, label: "Reunião" },
  EMAIL: { icon: Mail, label: "E-mail" },
  PROPOSTA: { icon: FileText, label: "Proposta" },
  LIGACAO: { icon: Phone, label: "Ligação" },
  WHATSAPP: { icon: MessageCircle, label: "WhatsApp" },
  NOTA: { icon: StickyNote, label: "Registro" },
};

/** Shade of each stage, from light to the brand colour; the won stage is green. */
const STAGE_TONE = ["var(--chart-4)", "var(--chart-3)", "var(--chart-2)", "var(--chart-1)"];

const valorLabel = (n: Negocio) => (n.recorrente ? `${brl(n.valor)}/mês` : brl(n.valor));

const diasTexto = (dias: number) => (dias === 0 ? "hoje" : dias === 1 ? "1 dia" : `${dias} dias`);

function OrigemTag({ origem }: { origem: Origem }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", ORIGEM_DOT[origem])} />
      {origem}
    </span>
  );
}

export function ComercialPage() {
  const { data, error, retry, refresh } = useLoad((signal) => api<ComercialView>("/api/empresa/comercial", { signal }));
  // Moves made on this screen, shown at once while the API confirms them.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);

  const etapaDe = (n: Negocio) => moves[n.id] ?? n.etapa;
  const text = search.trim().toLowerCase();
  const visible =
    data?.negocios.filter(
      (n) =>
        (owner === "todos" || n.responsavel === owner) &&
        (!text || `${n.empresa} ${n.contato} ${n.segmento} ${n.servico}`.toLowerCase().includes(text)),
    ) ?? [];
  const aberto = data?.negocios.find((n) => n.id === openId) ?? null;
  const s = data?.stats;

  async function move(id: string, etapa: string) {
    const negocio = data?.negocios.find((n) => n.id === id);
    if (!negocio || !data || etapaDe(negocio) === etapa) return;
    const label = data.etapas.find((e) => e.key === etapa)?.label ?? etapa;
    setMoves((previous) => ({ ...previous, [id]: etapa }));
    try {
      await api(`/api/empresa/comercial/negocios/${id}`, { method: "PATCH", body: { etapa } });
      notifySuccess(etapa === data.etapaGanha ? "Negócio fechado" : "Negócio movido", `${negocio.empresa} em ${label}`);
      await refresh();
    } catch (e) {
      setMoves((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      notifyError(e, "Não foi possível mover o negócio");
    }
  }

  return (
    <>
      <PageHeader
        title={data?.titulo ?? "Comercial"}
        description={data?.descricao ?? "Novos negócios, do primeiro contato ao contrato assinado."}
        actions={
          <Button onClick={() => notifySuccess("Novo negócio", "Na demonstração o funil não recebe negócios novos.")}>
            <Plus data-icon="inline-start" />
            Novo negócio
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          icon={Wallet}
          label="Pipeline em aberto"
          value={s ? brlShort(s.pipelineTotal) : null}
          hint={s ? `${s.abertos} negócios em andamento` : "Negócios em andamento"}
        />
        <StatCard
          icon={FileText}
          label="Propostas abertas"
          value={s ? s.propostasAbertas : null}
          badge={s && <Badge variant="outline">{brlShort(s.propostasValor)}</Badge>}
          hint="Enviadas ou em negociação"
        />
        <StatCard
          icon={Percent}
          label="Conversão 90 dias"
          value={s ? pct(s.conversao90) : null}
          badge={
            s && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                <TrendingUp />+{s.conversao90 - s.conversao90Antes} p.p.
              </Badge>
            )
          }
          hint={s ? `Antes ${pct(s.conversao90Antes)}, de lead a contrato` : "De lead a contrato"}
        />
        <StatCard
          icon={Handshake}
          label="Ticket médio"
          value={s ? brlShort(s.ticketMedio) : null}
          hint={s ? `${s.ganhos90} negócios fechados em 90 dias` : "Negócios fechados"}
        />
      </StatGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar negócios"
              placeholder="Empresa, contato ou segmento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="min-w-48" aria-label="Responsável">
              <Filter className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              {data?.responsaveis.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Arraste um card para outra etapa ou clique para ver o histórico.</p>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
          <div className="grid min-w-[1180px] grid-cols-5 gap-3">
            {(data?.etapas ?? Array.from({ length: 5 }, (_, i) => ({ key: `s${i}`, label: "" }))).map((etapa, index) => {
              const items = visible.filter((n) => etapaDe(n) === etapa.key);
              const total = items.reduce((sum, n) => sum + n.valor, 0);
              const ganha = etapa.key === data?.etapaGanha;
              const tone = ganha ? "var(--color-emerald-500)" : STAGE_TONE[index] ?? "var(--chart-1)";
              const isOver = over === etapa.key && dragging !== null;
              return (
                <section
                  key={etapa.key}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (over !== etapa.key) setOver(etapa.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === etapa.key ? null : o));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || dragging;
                    setOver(null);
                    setDragging(null);
                    if (id) void move(id, etapa.key);
                  }}
                  className={cn(
                    "flex min-h-[560px] flex-col gap-2.5 rounded-2xl border border-transparent bg-muted/45 p-2.5 transition-colors duration-150",
                    isOver && "border-primary/40 bg-primary/5 ring-4 ring-primary/10",
                  )}
                >
                  <header className="flex flex-col gap-2 px-1.5 pt-1">
                    <div className="h-1 rounded-full" style={{ background: tone }} />
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold">{data ? etapa.label : <Skeleton className="h-4 w-24" />}</h2>
                      {data && (
                        <span className="rounded-full bg-background px-2 py-px text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border">
                          {items.length}
                        </span>
                      )}
                    </div>
                    <span className="-mt-1 text-xs text-muted-foreground tabular-nums">{data ? brlShort(total) : " "}</span>
                  </header>

                  {!data
                    ? Array.from({ length: 3 - (index % 2) }, (_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
                    : items.map((n) => (
                        <DealCard
                          key={n.id}
                          negocio={n}
                          ganha={ganha}
                          parado={!ganha && n.diasNaEtapa >= data.diasParado && !moves[n.id]}
                          dragging={dragging === n.id}
                          onOpen={() => setOpenId(n.id)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", n.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragging(n.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      ))}
                  {data && items.length === 0 && (
                    <div
                      className={cn(
                        "flex flex-1 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground",
                        isOver && "border-primary/50 text-primary",
                      )}
                    >
                      {isOver ? "Solte aqui" : "Nenhum negócio"}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={aberto !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {aberto && data && <Detalhe negocio={aberto} view={data} etapa={etapaDe(aberto)} onMove={(etapa) => void move(aberto.id, etapa)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DealCard({
  negocio: n,
  ganha,
  parado,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  negocio: Negocio;
  ganha: boolean;
  parado: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      draggable
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex cursor-grab flex-col gap-2.5 rounded-xl border bg-card p-3 shadow-xs transition-all duration-150 outline-none select-none",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
        dragging && "scale-[0.98] rotate-1 opacity-40 shadow-none",
        parado && "border-amber-500/40",
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm leading-tight font-semibold">{n.empresa}</h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.segmento}</p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold tracking-tight tabular-nums">
          {brl(n.valor)}
          <span className="text-xs font-normal text-muted-foreground">{n.recorrente ? "/mês" : " total"}</span>
        </span>
        {!ganha && <span className="text-[11px] text-muted-foreground tabular-nums">{n.probabilidade}%</span>}
      </div>

      <p className="flex items-start gap-1.5 text-xs leading-snug text-foreground/80">
        {ganha ? (
          <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <ArrowRight className="mt-px size-3.5 shrink-0 text-primary" />
        )}
        <span className="line-clamp-2">{n.proximoPasso}</span>
      </p>

      {parado && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          Parado há {n.diasNaEtapa} dias
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Pessoa name={n.responsavel} />
          <OrigemTag origem={n.origem} />
        </span>
        <span className="flex shrink-0 items-center gap-1 tabular-nums" title="Dias nesta etapa">
          <Hourglass className="size-3" />
          {diasTexto(n.diasNaEtapa)}
        </span>
      </div>
    </article>
  );
}

function Detalhe({
  negocio: n,
  view,
  etapa,
  onMove,
}: {
  negocio: Negocio;
  view: ComercialView;
  etapa: string;
  onMove: (etapa: string) => void;
}) {
  const index = view.etapas.findIndex((e) => e.key === etapa);
  const proxima = view.etapas[index + 1];
  const rows: [string, React.ReactNode][] = [
    ["Valor", valorLabel(n)],
    ["Serviço", n.servico],
    ["Contato", n.contato],
    ["Responsável", n.responsavel],
    ["Origem", <OrigemTag key="o" origem={n.origem} />],
    ["Nesta etapa há", diasTexto(n.diasNaEtapa)],
    ["Chance de fechar", `${n.probabilidade}%`],
  ];
  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-xl">{n.empresa}</SheetTitle>
        <SheetDescription>{n.segmento}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6">
        <div className="flex items-center gap-1">
          {view.etapas.map((e, i) => (
            <button
              key={e.key}
              type="button"
              onClick={() => onMove(e.key)}
              className="group/step flex flex-1 flex-col gap-1.5 text-left"
              title={`Mover para ${e.label}`}
            >
              <span
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  i <= index ? (etapa === view.etapaGanha ? "bg-emerald-500" : "bg-primary") : "bg-muted group-hover/step:bg-primary/30",
                )}
              />
              <span className={cn("truncate text-[11px]", i === index ? "font-medium text-foreground" : "text-muted-foreground")}>
                {e.label}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="size-4 text-primary" />
            Próximo passo
          </div>
          <p className="text-sm leading-relaxed">{n.proximoPasso}</p>
          {proxima && (
            <Button size="sm" className="mt-3" onClick={() => onMove(proxima.key)}>
              Mover para {proxima.label}
              <ArrowRight data-icon="inline-end" />
            </Button>
          )}
        </div>

        <dl className="grid gap-0">
          {rows.map(([label, value], i) => (
            <div key={label}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Histórico</h3>
          <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
            {n.atividades.map((a, i) => {
              const { icon: Icon, label } = ATIVIDADE[a.tipo];
              return (
                <li key={i} className="relative flex gap-3">
                  <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="grid gap-0.5 pt-0.5">
                    <span className="text-sm leading-snug">{a.texto}</span>
                    <span className="text-xs text-muted-foreground">
                      {label} · {a.fonte} · {ago(a.quando)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
