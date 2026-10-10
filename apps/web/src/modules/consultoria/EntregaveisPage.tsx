"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FolderOpen, Hourglass, PackageCheck, PackageX, Search } from "lucide-react";
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
import { EmptyState, ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { ENTREGAVEL_LABEL, FRENTE_LABEL } from "./labels";
import { EQUIPE } from "./team";
import type { Entregavel } from "./types";
import { EntregavelBadge, firstName, inDays, shortDay, useResumo } from "./ui";

const options = <T extends string>(labels: Record<T, string>): FacetOption[] =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

const COLUMN_LABELS: Record<string, string> = {
  frente: "Frente",
  responsavel: "Responsável",
  prazo: "Prazo",
  status: "Status",
  pasta: "Onde está",
};

const entregue = (e: Entregavel) => e.status === "ENTREGUE" || e.status === "APROVACAO_CLIENTE";

export function EntregaveisPage() {
  const resumo = useResumo();
  const router = useRouter();

  const columns = useMemo<DataTableColumnDef<Entregavel>[]>(
    () => [
      {
        id: "nome",
        accessorFn: (e) => e.nome,
        enableHiding: false,
        header: "Entregável",
        cell: ({ row }) => (
          <div className="grid w-80 gap-0.5">
            <span className="truncate font-medium">{row.original.nome}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.apelido} · {row.original.projeto}
            </span>
          </div>
        ),
      },
      {
        id: "frente",
        accessorFn: (e) => e.frente,
        header: "Frente",
        cell: ({ row }) => (
          <Badge variant="outline" className="whitespace-nowrap">
            {FRENTE_LABEL[row.original.frente]}
          </Badge>
        ),
      },
      {
        id: "responsavel",
        accessorFn: (e) => e.responsavel,
        header: "Responsável",
        cell: ({ row }) => <span className="whitespace-nowrap">{firstName(row.original.responsavel)}</span>,
      },
      {
        id: "prazo",
        accessorFn: (e) => e.prazo,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Prazo" />,
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="grid gap-0.5 whitespace-nowrap">
              <span className="tabular-nums">{shortDay(e.prazo)}</span>
              <span className={cn("text-xs", e.status === "ATRASADO" ? "font-medium text-destructive" : "text-muted-foreground")}>
                {entregue(e) ? `entregue ${inDays(e.prazo)}` : e.status === "ATRASADO" ? `venceu ${inDays(e.prazo)}` : inDays(e.prazo)}
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (e) => e.status,
        header: "Status",
        cell: ({ row }) => <EntregavelBadge status={row.original.status} />,
      },
      {
        id: "pasta",
        accessorFn: (e) => e.pasta,
        header: "Onde está",
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <FolderOpen className="size-3.5" />
            {row.original.pasta}
          </span>
        ),
      },
    ],
    [],
  );

  const list = useServerTable<Entregavel>({
    path: "/api/consultoria/entregaveis",
    sortable: ["prazo"],
    columns,
    filters: ["status", "frente", "responsavel"],
    initialVisibility: { frente: false },
    getRowId: (e) => e.id,
  });
  const { table, page, error, loading, retry, search, setSearch, filtered, clearFilters } = list;
  const r = resumo.data;

  return (
    <>
      <PageHeader
        title="Entregáveis"
        description="Tudo o que cada projeto prometeu entregar ao cliente, com prazo, responsável e onde está o arquivo."
      />

      <StatGrid>
        <StatCard icon={PackageCheck} label="Entregues em 30 dias" value={r ? r.entregues30 : null} hint="Enviados ao cliente" />
        <StatCard icon={CalendarClock} label="Vencem em 15 dias" value={r ? r.proximas15 : null} hint="Em andamento ou ainda não iniciados" />
        <StatCard
          icon={PackageX}
          label="Atrasados"
          value={r ? r.atrasadas : null}
          badge={r && r.atrasadas > 0 && <Badge variant="destructive">Verifique</Badge>}
          hint="O prazo passou e não foi entregue"
        />
        <StatCard icon={Hourglass} label="Com o cliente para aprovar" value={r ? r.aguardandoCliente : null} hint="Entregues, esperando o retorno" />
      </StatGrid>

      <DataTableCard>
        <DataTableCardHeader>
          <CardTitle className="text-xl leading-none">Entregáveis dos projetos</CardTitle>
          <CardDescription>Atrasados primeiro, depois o prazo mais próximo. Clique num entregável para abrir o projeto.</CardDescription>
          <div className="col-span-full mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-72">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Buscar entregáveis"
                  placeholder="Entregável, cliente ou pessoa…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={options(ENTREGAVEL_LABEL)} />
              <DataTableFacetedFilter column={table.getColumn("frente")} title="Frente" options={options(FRENTE_LABEL)} />
              <DataTableFacetedFilter
                column={table.getColumn("responsavel")}
                title="Responsável"
                options={EQUIPE.map((p) => ({ value: p.nome, label: p.nome }))}
              />
              <DataTableResetFilters visible={filtered} onReset={clearFilters} />
            </div>
            <DataTableViewOptions table={table} labels={COLUMN_LABELS} />
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
              onRowClick={(e) => router.push(`/projetos?ficha=${e.projetoId}`)}
              empty={
                <EmptyState
                  icon={Search}
                  title="Nenhum entregável encontrado"
                  description="Nenhum entregável atende à busca e aos filtros."
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
            <DataTablePagination table={table} noun={["entregável", "entregáveis"]} />
          </DataTableCardFooter>
        )}
      </DataTableCard>
    </>
  );
}
