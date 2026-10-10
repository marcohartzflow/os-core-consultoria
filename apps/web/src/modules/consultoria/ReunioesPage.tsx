"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, CircleCheck, FileText, ListChecks, ListPlus, MessageSquareQuote, Search, UserRoundX, Users } from "lucide-react";
import { api } from "@/core/api/client";
import { fetchPage, toQuery } from "@/core/api/query";
import { useLoad } from "@/core/api/useLoad";
import {
  DataTable,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableResetFilters,
  type FacetOption,
} from "@/core/ui/data-table/DataTable";
import { DataTableCard, DataTableCardFooter, DataTableCardHeader } from "@/core/ui/data-table/DataTableCard";
import { type DataTableColumnDef } from "@/core/ui/data-table/features";
import { useServerTable } from "@/core/ui/data-table/useServerTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { FONTE_LABEL, FRENTE_LABEL } from "./labels";
import type { Combinado, Projeto, Reuniao } from "./types";
import { CombinadoBadge, criarTarefasDosCombinados, firstName, inDays, OrigemTag, pct, shortDay, useResumo, weekDay } from "./ui";

const options = <T extends string>(labels: Record<T, string>): FacetOption[] =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

export function ReunioesPage() {
  const resumo = useResumo();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reuniaoId = params.get("reuniao");
  // Clients for the filter, from the projects (one row per project, nicknames are unique).
  const clientes = useLoad((signal) => fetchPage<Projeto>(`/api/consultoria/projetos${toQuery({ size: 100 })}`, signal));
  const clienteOptions: FacetOption[] = [...new Set(clientes.data?.content.map((p) => p.apelido) ?? [])]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((apelido) => ({ value: apelido, label: apelido }));

  const setReuniao = (reuniao: Reuniao | null) => {
    const next = new URLSearchParams(params);
    if (reuniao) next.set("reuniao", reuniao.id);
    else next.delete("reuniao");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const columns = useMemo<DataTableColumnDef<Reuniao>[]>(
    () => [
      {
        id: "data",
        accessorFn: (r) => r.data,
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quando" />,
        cell: ({ row }) => (
          <div className="grid gap-0.5 whitespace-nowrap">
            <span className="tabular-nums">{weekDay(row.original.data)}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.hora} · {inDays(row.original.data)}
            </span>
          </div>
        ),
      },
      {
        id: "cliente",
        accessorFn: (r) => r.apelido,
        header: "Reunião",
        cell: ({ row }) => (
          <div className="grid w-72 gap-0.5">
            <span className="truncate font-medium">{row.original.titulo}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.apelido} · {row.original.projeto}
            </span>
          </div>
        ),
      },
      {
        id: "origem",
        accessorFn: (r) => r.origem,
        header: "Transcrição",
        cell: ({ row }) => <OrigemTag origem={row.original.origem} />,
      },
      {
        id: "participantes",
        accessorFn: (r) => r.participantes.length,
        header: "Participantes",
        cell: ({ row }) => {
          const doCliente = row.original.participantes.filter((p) => p.lado === "CLIENTE");
          return (
            <div className="grid w-44 gap-0.5">
              <span className="truncate">{doCliente.map((p) => firstName(p.nome)).join(", ")}</span>
              <span className="text-xs text-muted-foreground">
                + {row.original.participantes.length - doCliente.length} da equipe · {row.original.duracaoMin} min
              </span>
            </div>
          );
        },
      },
      {
        id: "pendencia",
        accessorFn: (r) => r.semResponsavel,
        header: "O que foi combinado",
        cell: ({ row }) => {
          const r = row.original;
          const total = r.combinados.length;
          return (
            <div className="flex w-56 flex-col gap-1.5">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="bg-emerald-500" style={{ width: `${(r.feitos / total) * 100}%` }} />
                <span className="bg-primary/50" style={{ width: `${((total - r.feitos - r.semResponsavel) / total) * 100}%` }} />
                <span className="bg-destructive" style={{ width: `${(r.semResponsavel / total) * 100}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {total} {total === 1 ? "combinado" : "combinados"} · {r.feitos} {r.feitos === 1 ? "feito" : "feitos"}
                {r.semResponsavel > 0 && <span className="font-medium text-destructive"> · {r.semResponsavel} sem responsável</span>}
              </span>
            </div>
          );
        },
      },
      {
        id: "frente",
        accessorFn: (r) => r.frente,
        header: "Frente",
        cell: ({ row }) => (
          <Badge variant="outline" className="whitespace-nowrap">
            {FRENTE_LABEL[row.original.frente]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const list = useServerTable<Reuniao>({
    path: "/api/consultoria/reunioes",
    sortable: ["data"],
    defaultSort: { id: "data", desc: true },
    columns,
    filters: ["cliente", "origem", "pendencia", "frente"],
    initialVisibility: { frente: false },
    getRowId: (r) => r.id,
  });
  const { table, page, error, loading, retry, search, setSearch, filtered, clearFilters } = list;
  const r = resumo.data;

  return (
    <>
      <PageHeader
        title="Reuniões"
        description="Cada reunião com cliente, transcrita do Meet ou do Zoom: o resumo, quem estava e o que foi combinado, com quem ficou cada coisa."
      />

      <StatGrid>
        <StatCard icon={CalendarCheck} label="Reuniões nos últimos 30 dias" value={r ? r.reunioes30 : null} hint="Todas com ata no Drive do projeto" />
        <StatCard
          icon={ListChecks}
          label="Combinados registrados"
          value={r ? r.combinados30 : null}
          badge={r && <Badge variant="secondary">{r.feitos30} feitos</Badge>}
          hint="Pedidos e combinados lidos das transcrições"
        />
        <StatCard
          icon={UserRoundX}
          label="Sem responsável"
          value={r ? r.semResponsavel : null}
          badge={r && r.semResponsavel > 0 && <Badge variant="destructive">{r.reunioesComPendencia} reuniões</Badge>}
          hint="Ninguém assumiu na reunião, nem depois"
        />
        <StatCard
          icon={CircleCheck}
          label="Combinados com dono"
          value={r ? pct(((r.combinados30 - r.semResponsavel) / Math.max(r.combinados30, 1)) * 100) : null}
          hint="A ata cria a tarefa quando alguém assume na reunião"
        />
      </StatGrid>

      <DataTableCard>
        <DataTableCardHeader>
          <CardTitle className="text-xl leading-none">Reuniões com clientes</CardTitle>
          <CardDescription>As mais recentes primeiro. Clique numa reunião para ver o resumo e o que foi combinado.</CardDescription>
          <div className="col-span-full mt-3 flex flex-1 flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Buscar reuniões"
                placeholder="Cliente, assunto ou pessoa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <DataTableFacetedFilter column={table.getColumn("cliente")} title="Cliente" options={clienteOptions} />
            <DataTableFacetedFilter column={table.getColumn("origem")} title="Transcrição" options={options(FONTE_LABEL)} />
            <DataTableFacetedFilter
              column={table.getColumn("pendencia")}
              title="Combinados"
              options={[{ value: "SEM_RESPONSAVEL", label: "Com item sem responsável" }]}
            />
            <DataTableResetFilters visible={filtered} onReset={clearFilters} />
          </div>
        </DataTableCardHeader>
        <CardContent className="px-0">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !page ? (
            <TableSkeleton columns={5} />
          ) : (
            <DataTable
              table={table}
              loading={loading}
              onRowClick={setReuniao}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhuma reunião encontrada"
                  description="Nenhuma reunião atende à busca e aos filtros."
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
            <DataTablePagination table={table} noun={["reunião", "reuniões"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>

      <Sheet open={reuniaoId !== null} onOpenChange={(value) => !value && setReuniao(null)}>
        <SheetContent className="w-full sm:max-w-2xl">{reuniaoId && <ReuniaoLoader id={reuniaoId} />}</SheetContent>
      </Sheet>
    </>
  );
}

function ReuniaoLoader({ id }: { id: string }) {
  const { data, error, retry } = useLoad((signal) => api<Reuniao>(`/api/consultoria/reunioes/${id}`, { signal }), id);
  if (data && data.id === id) return <Ata reuniao={data} />;
  return (
    <>
      <SheetHeader>
        <SheetTitle>Reunião</SheetTitle>
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

// ---- the sheet: the minutes of one meeting --------------------------------------------------------

function Ata({ reuniao: r }: { reuniao: Reuniao }) {
  const [creating, setCreating] = useState<string | null>(null);
  const orfaos = r.combinados.filter((c) => c.status === "SEM_RESPONSAVEL");

  async function criar(ids: string[], key: string) {
    setCreating(key);
    await criarTarefasDosCombinados(ids);
    setCreating(null);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-xl leading-tight">{r.titulo}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {r.cliente} · {weekDay(r.data)}, {r.hora} · {r.duracaoMin} min
          </span>
          <OrigemTag origem={r.origem} />
        </SheetDescription>
        {orfaos.length > 0 && (
          <div className="pt-1">
            <Badge variant="destructive">
              <UserRoundX />
              {orfaos.length} {orfaos.length === 1 ? "combinado sem responsável" : "combinados sem responsável"}
            </Badge>
          </div>
        )}
      </SheetHeader>

      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4 text-primary" />
            Resumo da transcrição
          </h3>
          <p className="text-sm leading-relaxed">{r.resumo}</p>
          <span className="text-xs text-muted-foreground">
            Ata completa no Drive · {r.apelido} / Atas ·{" "}
            <Link href={`/projetos?ficha=${r.projetoId}`} className="underline-offset-2 hover:underline">
              {r.projeto}
            </Link>
          </span>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">O que foi combinado</h3>
            {orfaos.length > 1 && (
              <Button size="sm" onClick={() => criar(orfaos.map((c) => c.id), "todos")} disabled={creating !== null}>
                {creating === "todos" ? <Spinner data-icon="inline-start" /> : <ListPlus data-icon="inline-start" />}
                Criar as {orfaos.length} tarefas
              </Button>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {r.combinados.map((c) => (
              <CombinadoItem key={c.id} combinado={c} creating={creating === c.id} disabled={creating !== null} onCreate={() => criar([c.id], c.id)} />
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" />
            Participantes
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {r.participantes.map((p) => (
              <li key={p.nome} className="flex flex-col rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{p.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {p.lado === "CLIENTE" ? `${r.apelido}, ${p.papel}` : p.papel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function CombinadoItem({
  combinado: c,
  creating,
  disabled,
  onCreate,
}: {
  combinado: Combinado;
  creating: boolean;
  disabled: boolean;
  onCreate: () => void;
}) {
  const orfao = c.status === "SEM_RESPONSAVEL";
  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border p-3", orfao && "border-destructive/30 bg-destructive/5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex-1 text-sm leading-snug font-medium">{c.texto}</span>
        <CombinadoBadge status={c.status} />
      </div>
      <span className="text-xs text-muted-foreground">
        Pedido de {c.pedidoPor}
        {c.status === "FEITO" && ` · feito por ${firstName(c.responsavel ?? "")}${c.feitoEm ? ` em ${shortDay(c.feitoEm)}` : ""}: ${c.feito}`}
        {(c.status === "EM_ANDAMENTO" || c.status === "ATRASADO") &&
          ` · com ${c.responsavel}${c.prazo ? `, prazo ${shortDay(c.prazo)}${c.status === "ATRASADO" ? ` (${inDays(c.prazo)})` : ""}` : ""}`}
      </span>
      {c.trecho && (
        <p className="flex gap-1.5 text-sm leading-snug text-muted-foreground">
          <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="italic">“{c.trecho}”</span> aos {c.minuto} min
          </span>
        </p>
      )}
      {c.impacto && orfao && <p className="text-sm font-medium text-destructive">{c.impacto}.</p>}
      {orfao && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">
            Sugestão da IA: {c.sugerido}, até {shortDay(c.prazoSugerido)}
          </span>
          <Button size="sm" variant="outline" onClick={onCreate} disabled={disabled}>
            {creating ? <Spinner data-icon="inline-start" /> : <ListPlus data-icon="inline-start" />}
            Criar tarefa para {firstName(c.sugerido)}
          </Button>
        </div>
      )}
    </li>
  );
}
