"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { CalendarClock, FileSignature, FolderKanban, ListPlus, PackageCheck, RefreshCcw, Search, Sparkles, UserRoundX } from "lucide-react";
import { api } from "@/core/api/client";
import { announceDataChanged, useLoad } from "@/core/api/useLoad";
import {
  DataTable,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableResetFilters,
  DataTableViewOptions,
  type FacetOption,
} from "@/core/ui/data-table/DataTable";
import { DataTableCard, DataTableCardFooter, DataTableCardHeader } from "@/core/ui/data-table/DataTableCard";
import { type DataTableColumnDef } from "@/core/ui/data-table/features";
import { useServerTable } from "@/core/ui/data-table/useServerTable";
import { EmptyState, ErrorState, notifyError, notifySuccess, TableSkeleton } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AVISO_LABEL, CONTINUIDADE_LABEL, FASES, FASE_LABEL, FRENTE_LABEL } from "./labels";
import { RESPONSAVEIS } from "./team";
import type { Entregavel, Projeto, Reuniao, TipoAviso } from "./types";
import {
  AvisoBadge,
  brl,
  brlShort,
  COMBINADO_ICON,
  COMBINADO_TONE,
  ContinuidadeBadge,
  daysUntil,
  EntregavelBadge,
  estouroText,
  EVENTO_ICON,
  FaseSteps,
  firstName,
  formatDay,
  HorasBar,
  inDays,
  margemText,
  OrigemTag,
  pct,
  shortDay,
  useResumo,
  weekDay,
} from "./ui";

const options = <T extends string>(labels: Record<T, string>): FacetOption[] =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

const COLUMN_LABELS: Record<string, string> = {
  frente: "Frente",
  responsavel: "Responsável",
  fase: "Fase",
  entregas: "Entregas",
  estouro: "Horas",
  fim: "Término",
  continuidade: "Continuidade",
  aviso: "Aviso da IA",
};

const AVISO_ORDEM: TipoAviso[] = ["SEM_RESPONSAVEL", "SEM_CONTINUIDADE", "HORAS_ACIMA", "ENTREGA_ATRASADA"];

interface Detalhe {
  projeto: Projeto;
  reunioes: Reuniao[];
  entregaveis: Entregavel[];
}

export function ProjetosPage() {
  const resumo = useResumo();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fichaId = params.get("ficha");

  const setFicha = (projeto: Projeto | null) => {
    const next = new URLSearchParams(params);
    if (projeto) next.set("ficha", projeto.id);
    else next.delete("ficha");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const columns = useMemo<DataTableColumnDef<Projeto>[]>(
    () => [
      {
        id: "cliente",
        accessorFn: (p) => p.cliente,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Projeto" />,
        cell: ({ row }) => (
          <div className="grid w-64 gap-0.5">
            <span className="truncate font-medium">{row.original.cliente}</span>
            <span className="truncate text-xs text-muted-foreground">{row.original.nome}</span>
          </div>
        ),
      },
      {
        id: "frente",
        accessorFn: (p) => p.frente,
        header: "Frente",
        cell: ({ row }) => (
          <Badge variant="outline" className="whitespace-nowrap">
            {FRENTE_LABEL[row.original.frente]}
          </Badge>
        ),
      },
      {
        id: "responsavel",
        accessorFn: (p) => p.responsavel,
        header: "Responsável",
        cell: ({ row }) => <span className="whitespace-nowrap">{firstName(row.original.responsavel)}</span>,
      },
      {
        id: "fase",
        accessorFn: (p) => p.fase,
        header: "Fase",
        cell: ({ row }) => <FaseSteps fase={row.original.fase} className="w-32" />,
      },
      {
        id: "entregas",
        accessorFn: (p) => p.entregas.entregues / p.entregas.total,
        header: "Entregas",
        cell: ({ row }) => {
          const e = row.original.entregas;
          return (
            <div className="grid w-48 gap-0.5">
              <span className="tabular-nums">
                {e.entregues} de {e.total} entregues
                {e.atrasadas > 0 && <span className="text-destructive"> · {e.atrasadas} {e.atrasadas === 1 ? "atrasada" : "atrasadas"}</span>}
              </span>
              {e.proxima && (
                <span className={cn("truncate text-xs", daysUntil(e.proxima.prazo) < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {e.proxima.nome} · {shortDay(e.proxima.prazo)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "estouro",
        accessorFn: (p) => p.estouro,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Horas lançadas / orçadas" />,
        cell: ({ row }) => {
          const p = row.original;
          const mensal = p.cobranca === "MENSAL";
          return (
            <div className="grid w-40 gap-1.5">
              <span className="tabular-nums">
                {p.horasLancadas}h <span className="text-muted-foreground">/ {p.horasOrcadas}h{mensal ? " por mês" : ""}</span>
              </span>
              <HorasBar orcadas={p.horasOrcadas} lancadas={p.horasLancadas} projetadas={p.horasProjetadas} estouro={p.estouro} />
              <span className={cn("text-xs tabular-nums", estouroText(p.estouro))}>
                {mensal
                  ? p.estouro > 0
                    ? `+${p.estouro}% acima do orçado`
                    : "dentro do orçado"
                  : `projeção ${p.horasProjetadas}h (${p.estouro > 0 ? "+" : ""}${p.estouro}%)`}
              </span>
            </div>
          );
        },
      },
      {
        id: "fim",
        accessorFn: (p) => p.fim,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Término" />,
        cell: ({ row }) =>
          row.original.cobranca === "MENSAL" ? (
            <span className="text-sm text-muted-foreground">Mensal</span>
          ) : (
            <div className="grid gap-0.5 whitespace-nowrap">
              <span className="tabular-nums">{shortDay(row.original.fim)}</span>
              <span className="text-xs text-muted-foreground">{inDays(row.original.fim)}</span>
            </div>
          ),
      },
      {
        id: "continuidade",
        accessorFn: (p) => p.continuidade.status,
        header: "Continuidade",
        cell: ({ row }) => <ContinuidadeBadge status={row.original.continuidade.status} dias={daysUntil(row.original.fim)} />,
      },
      {
        id: "aviso",
        accessorFn: (p) => p.avisos[0] ?? "",
        header: "Aviso da IA",
        cell: ({ row }) => {
          const avisos = [...row.original.avisos].sort((a, b) => AVISO_ORDEM.indexOf(a) - AVISO_ORDEM.indexOf(b));
          if (!avisos.length) return <span className="text-sm text-muted-foreground">Nenhum</span>;
          return (
            <div className="flex items-center gap-1">
              <AvisoBadge tipo={avisos[0]} />
              {avisos.length > 1 && <Badge variant="secondary">+{avisos.length - 1}</Badge>}
            </div>
          );
        },
      },
    ],
    [],
  );

  const list = useServerTable<Projeto>({
    path: "/api/consultoria/projetos",
    sortable: ["cliente", "estouro", "fim"],
    columns,
    filters: ["frente", "responsavel", "fase", "aviso"],
    initialVisibility: { responsavel: false, frente: false },
    getRowId: (p) => p.id,
  });
  const { table, page, error, loading, retry, search, setSearch, filtered, clearFilters } = list;
  const r = resumo.data;

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Cada cliente, em que fase está, o que já foi entregue e o que vem depois do contrato."
      />

      <StatGrid>
        <StatCard
          icon={FolderKanban}
          label="Projetos em andamento"
          value={r ? r.emAndamento : null}
          badge={r && <Badge variant="outline">{brlShort(r.valorEmCarteira)}</Badge>}
          hint="Valor em contrato; o mensal contado por 12 meses"
        />
        <StatCard
          icon={RefreshCcw}
          label="Terminam em 30 dias"
          value={r ? r.terminam30 : null}
          badge={r && <Badge variant="destructive">{r.semContinuidade} sem continuidade</Badge>}
          hint={r ? `${brlShort(r.renovacaoAno)}/ano de renovação em jogo` : "Renovação é receita"}
        />
        <StatCard
          icon={PackageCheck}
          label="Entregas nos próximos 15 dias"
          value={r ? r.proximas15 : null}
          badge={r && (r.atrasadas > 0 ? <Badge variant="destructive">{r.atrasadas} atrasadas</Badge> : <Badge variant="secondary">Em dia</Badge>)}
          hint={r ? `${r.aguardandoCliente} com o cliente para aprovar` : "Entregáveis dos projetos"}
        />
        <StatCard
          icon={UserRoundX}
          label="Combinados sem responsável"
          value={r ? r.semResponsavel : null}
          badge={r && <Badge variant="destructive">{r.clientesComPendencia} clientes</Badge>}
          hint="Pedidos feitos em reunião que não viraram tarefa"
        />
      </StatGrid>

      <DataTableCard>
        <DataTableCardHeader>
          <CardTitle className="text-xl leading-none">Projetos em andamento</CardTitle>
          <CardDescription>Os que pedem uma decisão vêm primeiro. Clique num projeto para ver a ficha, as reuniões e o que a IA cruzou.</CardDescription>
          <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-72">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Buscar projetos"
                  placeholder="Cliente, projeto ou pessoa…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("frente")} title="Frente" options={options(FRENTE_LABEL)} />
              <DataTableFacetedFilter
                column={table.getColumn("responsavel")}
                title="Responsável"
                options={RESPONSAVEIS.map((n) => ({ value: n, label: n }))}
              />
              <DataTableFacetedFilter column={table.getColumn("fase")} title="Fase" options={options(FASE_LABEL)} />
              <DataTableFacetedFilter column={table.getColumn("aviso")} title="Aviso da IA" options={options(AVISO_LABEL)} />
              <DataTableResetFilters visible={filtered} onReset={clearFilters} />
            </div>
            <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
          </div>
        </DataTableCardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !page ? (
            <TableSkeleton columns={8} />
          ) : (
            <DataTable
              table={table}
              loading={loading}
              onRowClick={setFicha}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhum projeto encontrado"
                  description="Nenhum projeto atende à busca e aos filtros."
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
        {page && !error && (
          <DataTableCardFooter>
            <DataTablePagination table={table} noun={["projeto", "projetos"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>

      <Sheet open={fichaId !== null} onOpenChange={(value) => !value && setFicha(null)}>
        <SheetContent className="w-full sm:max-w-2xl">{fichaId && <FichaLoader id={fichaId} />}</SheetContent>
      </Sheet>
    </>
  );
}

function FichaLoader({ id }: { id: string }) {
  const { data, error, retry } = useLoad((signal) => api<Detalhe>(`/api/consultoria/projetos/${id}`, { signal }), id);
  if (data && data.projeto.id === id) return <Ficha detalhe={data} />;
  return (
    <>
      <SheetHeader>
        <SheetTitle>Ficha do projeto</SheetTitle>
        <SheetDescription>{error ? "Não foi possível abrir" : "Carregando…"}</SheetDescription>
      </SheetHeader>
      {error ? (
        <ErrorState error={error} onRetry={retry} className="p-4" />
      ) : (
        <div className="flex flex-col gap-4 px-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
    </>
  );
}

// ---- the sheet ----------------------------------------------------------------------------------------

function Tile({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xl leading-tight font-semibold whitespace-nowrap tabular-nums", className)}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Secao({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: typeof Sparkles;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="size-4 text-primary" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Ficha({ detalhe }: { detalhe: Detalhe }) {
  const { projeto: p, reunioes, entregaveis } = detalhe;
  const [creating, setCreating] = useState(false);
  const mensal = p.cobranca === "MENSAL";
  const custoProjetado = Math.round(p.horasProjetadas * p.custoHora);
  const rows: [string, React.ReactNode][] = [
    ["Cliente", p.cliente],
    ["Segmento", p.segmento],
    ["Contato no cliente", p.contato],
    ["Gerente do projeto", p.responsavel],
    ["Sócio", p.socio],
    ["Equipe", p.equipe.map(firstName).join(", ")],
    ["Contrato", mensal ? `${brl(p.valor)} por mês` : `${brl(p.valor)}, preço fechado`],
    ["Custo-hora médio da equipe", brl(p.custoHora)],
    ["Período", `${formatDay(p.inicio)} a ${formatDay(p.fim)}`],
  ];

  async function criarTarefa() {
    setCreating(true);
    try {
      await api(`/api/consultoria/projetos/${p.id}/tarefa`, { method: "POST" });
      notifySuccess("Tarefa criada", `Para ${p.responsavel}, com a ação sugerida`);
      announceDataChanged();
    } catch (e) {
      notifyError(e, "Não foi possível criar a tarefa");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-xl leading-tight">{p.nome}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{FRENTE_LABEL[p.frente]}</Badge>
          <span>
            {p.cliente} · {p.cidade}
          </span>
        </SheetDescription>
        {p.avisos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.avisos.map((a) => (
              <AvisoBadge key={a} tipo={a} />
            ))}
          </div>
        )}
      </SheetHeader>

      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <Tile label={mensal ? "Contrato mensal" : "Valor do contrato"} value={brlShort(p.valor)} />
          <Tile
            label={mensal ? "Horas por mês" : "Horas lançadas"}
            value={`${p.horasLancadas}h`}
            hint={mensal ? `orçado ${p.horasOrcadas}h` : `de ${p.horasOrcadas}h · ${p.concluido}% feito`}
          />
          <Tile
            label={mensal ? "Acima do orçado" : "Projeção ao fim"}
            value={mensal ? `${p.estouro > 0 ? "+" : ""}${p.estouro}%` : `${p.horasProjetadas}h`}
            hint={mensal ? "média de 3 meses" : `${p.estouro > 0 ? "+" : ""}${p.estouro}% sobre o orçado`}
            className={estouroText(p.estouro)}
          />
          <Tile
            label="Margem"
            value={<span className={margemText(p.margemAtual)}>{pct(p.margemAtual)}</span>}
            hint={`orçada ${pct(p.margemPlanejada)} · custo ${brlShort(custoProjetado)}`}
          />
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{FASE_LABEL[p.fase]}</span>
            <span className="text-muted-foreground">{mensal ? "contrato mensal" : `termina ${inDays(p.fim)} (${shortDay(p.fim)})`}</span>
          </div>
          {!mensal && (
            <div className="mb-2 grid grid-cols-4 gap-1">
              {FASES.map((f, i) => {
                const current = FASES.indexOf(p.fase);
                return (
                  <div key={f} className="grid gap-1">
                    <span className={cn("h-1.5 rounded-full", i < current ? "bg-primary" : i === current ? "bg-primary/60" : "bg-muted")} />
                    <span className={cn("text-[11px]", i === current ? "font-medium" : "text-muted-foreground")}>{FASE_LABEL[f]}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-sm text-muted-foreground">{p.faseDetalhe}</p>
        </div>

        {p.meses && <MesesChart projeto={p} />}

        <Secao
          title="Reuniões e o que foi combinado"
          icon={Sparkles}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/reunioes?cliente=${encodeURIComponent(p.apelido)}`}>Todas</Link>
            </Button>
          }
        >
          <ul className="flex flex-col gap-3">
            {reunioes.map((r) => (
              <li key={r.id} className="rounded-xl border p-3">
                <Link href={`/reunioes?reuniao=${r.id}`} className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 hover:underline">
                  <span className="text-sm font-medium">{r.titulo}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {weekDay(r.data)} <OrigemTag origem={r.origem} />
                  </span>
                </Link>
                <ul className="flex flex-col gap-1.5">
                  {r.combinados.map((c) => {
                    const Icon = COMBINADO_ICON[c.status];
                    return (
                      <li key={c.id} className="flex gap-2 text-sm leading-snug">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", COMBINADO_TONE[c.status])} />
                        <span className="flex-1">
                          {c.texto}
                          <span className={cn("text-muted-foreground", c.status === "SEM_RESPONSAVEL" && "font-medium text-destructive")}>
                            {" · "}
                            {c.status === "FEITO"
                              ? `feito por ${firstName(c.responsavel ?? "")}${c.feitoEm ? ` em ${shortDay(c.feitoEm)}` : ""}`
                              : c.status === "SEM_RESPONSAVEL"
                                ? "ninguém ficou responsável"
                                : `com ${firstName(c.responsavel ?? "")}${c.prazo ? `, prazo ${shortDay(c.prazo)}` : ""}${c.status === "ATRASADO" ? " (atrasado)" : ""}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao title="Entregáveis">
          <ul className="flex flex-col divide-y rounded-xl border">
            {entregaveis.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="grid gap-0.5">
                  <span>{e.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {firstName(e.responsavel)} · {e.status === "ENTREGUE" || e.status === "APROVACAO_CLIENTE" ? "entregue em" : "prazo"}{" "}
                    {shortDay(e.prazo)}
                  </span>
                </div>
                <EntregavelBadge status={e.status} />
              </li>
            ))}
          </ul>
        </Secao>

        {p.causas && (
          <Secao title="Para onde foram as horas a mais">
            <ul className="flex flex-col gap-2">
              {p.causas.map((c) => (
                <li key={c.texto} className="flex items-start gap-3 text-sm leading-snug">
                  <span className="w-12 shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-center text-xs font-semibold text-destructive tabular-nums">
                    +{c.horas}h
                  </span>
                  <span>
                    {c.texto}
                    <span className="text-muted-foreground"> · {c.fonte}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        <Continuidade projeto={p} />

        <Secao title="Horas por pessoa">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Pessoa</th>
                  <th className="px-3 py-2 text-right font-medium">Custo-hora</th>
                  <th className="px-3 py-2 text-right font-medium">Horas{mensal ? "/mês" : ""}</th>
                  <th className="px-3 py-2 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {p.pessoas.map((x) => (
                  <tr key={x.nome} className="border-t">
                    <td className="px-3 py-2">
                      {x.nome} <span className="text-xs text-muted-foreground">· {x.nivel}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{brl(x.custoHora)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.horas}h</td>
                    <td className="px-3 py-2 text-right tabular-nums">{brl(x.horas * x.custoHora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <div className="rounded-xl border p-4">
          <div className="mb-1.5 text-sm font-medium">Ação sugerida</div>
          <p className="text-sm leading-relaxed">{p.acaoSugerida}</p>
          <Button size="sm" className="mt-3" onClick={criarTarefa} disabled={creating}>
            {creating ? <Spinner data-icon="inline-start" /> : <ListPlus data-icon="inline-start" />}
            Criar tarefa para {firstName(p.responsavel)}
          </Button>
        </div>

        <dl className="grid gap-0">
          {rows.map(([label, value], index) => (
            <div key={label}>
              {index > 0 && <Separator />}
              <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

/** What comes after the contract: the renewal proposal, or the lack of one, with the source. */
function Continuidade({ projeto: p }: { projeto: Projeto }) {
  const c = p.continuidade;
  const dias = daysUntil(p.fim);
  const urgente = c.status === "SEM_PROPOSTA" && dias <= 15 && p.cobranca === "FIXO";
  const Icon = c.evento ? EVENTO_ICON[c.evento.tipo] : null;
  if (c.status === "NAO_SE_APLICA" || (!c.texto && c.status === "SEM_PROPOSTA")) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" />
          Continuidade
        </span>
        <span className="text-muted-foreground">
          {CONTINUIDADE_LABEL[c.status]}
          {p.cobranca === "FIXO" ? `; termina ${inDays(p.fim)}` : ""}
        </span>
      </div>
    );
  }
  return (
    <div className={cn("rounded-xl border p-4", urgente ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <FileSignature className={cn("size-4", urgente ? "text-amber-600" : "text-primary")} />
          {urgente ? `Termina ${inDays(p.fim)} sem proposta de continuidade` : `Continuidade: ${CONTINUIDADE_LABEL[c.status].toLowerCase()}`}
        </span>
      </div>
      {c.valorMensal && (
        <p className="text-2xl font-semibold tabular-nums">
          {brl(c.valorMensal)}/mês
          <span className="ml-2 text-sm font-normal text-muted-foreground">{brlShort(c.valorMensal * 12)} por ano</span>
        </p>
      )}
      {c.texto && <p className="mt-1 text-sm leading-relaxed">{c.texto}.</p>}
      {c.evento && Icon && (
        <p className="mt-2 flex gap-1.5 text-sm leading-snug">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">{c.evento.fonte}: </span>
            {c.evento.texto}
          </span>
        </p>
      )}
    </div>
  );
}

function MesesChart({ projeto: p }: { projeto: Projeto }) {
  const over = p.estouro >= 10;
  const config = { horas: { label: "Horas lançadas", color: over ? "var(--destructive)" : "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Horas por mês</span>
        <span className="text-xs text-muted-foreground">orçado: {p.horasOrcadas}h por mês</span>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[160px] w-full">
        <BarChart data={p.meses!} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11 }} />
          <ReferenceLine y={p.horasOrcadas} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => <span className="font-medium tabular-nums">{Number(value)}h lançadas</span>} />} />
          <Bar dataKey="horas" fill="var(--color-horas)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
