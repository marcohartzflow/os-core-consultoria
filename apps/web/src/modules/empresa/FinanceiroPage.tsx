"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowUpRight, Download, Landmark, RefreshCw, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState, notifySuccess } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { FinanceiroView, Lancamento, StatusLancamento } from "./types";
import { ago, brl, brlShort, inDays, LogoBadge, pct, shortDate, StatusDot } from "./ui";

const fluxoConfig = {
  entradas: { label: "Entradas", color: "var(--chart-1)" },
  saidas: { label: "Saídas", color: "var(--chart-4)" },
  saldo: { label: "Saldo projetado", color: "var(--foreground)" },
} satisfies ChartConfig;

const CATEGORIA_CORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function StatusBadge({ status }: { status: StatusLancamento }) {
  if (status === "PAGO") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
        Pago
      </Badge>
    );
  }
  if (status === "VENCIDO") return <Badge variant="destructive">Vencido</Badge>;
  return <Badge variant="secondary">A vencer</Badge>;
}

export function FinanceiroPage() {
  const { data, error, retry } = useLoad((signal) => api<FinanceiroView>("/api/empresa/financeiro", { signal }));
  const r = data?.resumo;

  if (error) return <ErrorState error={error} onRetry={retry} />;

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Caixa, contas a pagar e a receber, conciliados com os bancos todo dia, sem planilha."
        actions={
          <Button variant="outline" onClick={() => notifySuccess("Relatório gerado", "O fechamento do mês foi enviado para o seu e-mail.")}>
            <Download data-icon="inline-start" />
            Fechamento do mês
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          icon={Landmark}
          label="Saldo em contas"
          value={r ? brlShort(r.saldo) : null}
          footer={data && `${data.contas.length} contas bancárias`}
          hint={data ? `Conciliado ${ago(data.contas[0].sincronizadoEm)}` : "Todas as contas"}
        />
        <StatCard
          icon={ArrowDownLeft}
          label="A receber em 30 dias"
          value={r ? brlShort(r.aReceber30) : null}
          footer={r && r.vencidosReceber > 0 && <span className="text-destructive">{brlShort(r.vencidosReceber)} vencido</span>}
          hint={r ? `${r.aReceber30Qtd} lançamentos em aberto` : "Lançamentos em aberto"}
        />
        <StatCard
          icon={ArrowUpRight}
          label="A pagar em 30 dias"
          value={r ? brlShort(r.aPagar30) : null}
          footer={r && `${r.aPagar30Qtd} contas a pagar`}
          hint="Folha, fornecedores e impostos"
        />
        <StatCard
          icon={Scale}
          label="Resultado do mês"
          value={r ? brlShort(r.resultadoMes) : null}
          footer={r && `Margem de ${pct(r.margemMes)}`}
          hint={r ? `Receita ${brlShort(r.receitaMes)}, despesas ${brlShort(r.despesaMes)}` : "Receita menos despesas"}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fluxo de caixa projetado</CardTitle>
            <CardDescription>Próximas 13 semanas, com o que já está lançado a pagar e a receber.</CardDescription>
            <CardAction className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-1" />
                Entradas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-4" />
                Saídas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-foreground" />
                Saldo
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {!data ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={fluxoConfig} className="aspect-auto h-[300px] w-full">
                <ComposedChart data={data.fluxo} margin={{ left: 4, right: 4, top: 8 }} barGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="semana" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="fluxo"
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => brlShort(v).replace("R$ ", "")}
                  />
                  <YAxis yAxisId="saldo" orientation="right" hide domain={["dataMin - 80000", "dataMax + 40000"]} />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => `Semana de ${label}`}
                        formatter={(value, name) => (
                          <div className="flex w-full justify-between gap-6">
                            <span className="text-muted-foreground">{fluxoConfig[name as keyof typeof fluxoConfig]?.label}</span>
                            <span className="font-medium tabular-nums">{brl(Number(value))}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar yAxisId="fluxo" dataKey="entradas" fill="var(--color-entradas)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar yAxisId="fluxo" dataKey="saidas" fill="var(--color-saidas)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line yAxisId="saldo" dataKey="saldo" type="monotone" stroke="var(--color-saldo)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas da empresa</CardTitle>
            <CardDescription>Saldos lidos direto dos bancos.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-sm" aria-label="Sincronizar" onClick={() => notifySuccess("Bancos sincronizados", "Saldos e extratos atualizados.")}>
                <RefreshCw />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!data
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)
              : data.contas.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2.5 rounded-xl border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <LogoBadge sigla={c.sigla} cor={c.cor} />
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-semibold">{c.banco}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.tipo}</span>
                      </div>
                      <span className="text-base font-semibold tabular-nums">{brl(c.saldo)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <StatusDot tone="ok" />
                        Sincronizado {ago(c.sincronizadoEm)}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-0.5 tabular-nums",
                          c.variacao30 >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                        )}
                      >
                        {c.variacao30 >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                        {c.variacao30 >= 0 ? "+" : ""}
                        {brlShort(c.variacao30)} em 30 dias
                      </span>
                    </div>
                  </div>
                ))}
            {r && (
              <div className="mt-1 flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">{brl(r.saldo)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Tabs defaultValue="pagar" className="gap-4">
            <CardHeader>
              <CardTitle>Lançamentos</CardTitle>
              <CardDescription>Os vencidos aparecem em destaque.</CardDescription>
              <CardAction>
                <TabsList>
                  <TabsTrigger value="pagar">Contas a pagar</TabsTrigger>
                  <TabsTrigger value="receber">Contas a receber</TabsTrigger>
                </TabsList>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0">
              <TabsContent value="pagar">
                <Lancamentos itens={data?.pagar} coluna="Fornecedor" />
              </TabsContent>
              <TabsContent value="receber">
                <Lancamentos itens={data?.receber} coluna="Cliente" />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <Categorias data={data} />
      </div>
    </>
  );
}

function Lancamentos({ itens, coluna }: { itens?: Lancamento[]; coluna: string }) {
  if (!itens) {
    return (
      <div className="flex flex-col gap-2 px-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">{coluna}</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="pr-6 text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map((l) => (
          <TableRow key={l.id} className={cn(l.status === "VENCIDO" && "bg-destructive/5 hover:bg-destructive/10")}>
            <TableCell className="pl-6">
              <div className="grid max-w-72 gap-0.5">
                <span className="truncate font-medium">{l.nome}</span>
                <span className="truncate text-xs text-muted-foreground">{l.descricao}</span>
              </div>
            </TableCell>
            <TableCell>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{l.categoria}</span>
            </TableCell>
            <TableCell>
              <div className="grid gap-0.5 whitespace-nowrap">
                <span className="tabular-nums">{shortDate(l.vencimento)}</span>
                <span className={cn("text-xs", l.status === "VENCIDO" ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {l.status === "PAGO" ? "quitado" : inDays(l.vencimento)}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{brl(l.valor)}</TableCell>
            <TableCell className="pr-6 text-right">
              <StatusBadge status={l.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Categorias({ data }: { data: FinanceiroView | null }) {
  const total = data?.categorias.reduce((s, c) => s + c.valor, 0) ?? 0;
  const config = Object.fromEntries(
    (data?.categorias ?? []).map((c, i) => [c.categoria, { label: c.categoria, color: CATEGORIA_CORES[i % CATEGORIA_CORES.length] }]),
  ) satisfies ChartConfig;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Despesas por categoria</CardTitle>
        <CardDescription>Despesas operacionais do mês.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!data ? (
          <Skeleton className="mx-auto size-48 rounded-full" />
        ) : (
          <div className="relative">
            <ChartContainer config={config} className="mx-auto aspect-square h-[220px]">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex w-full justify-between gap-6">
                          <span className="text-muted-foreground">{String(name)}</span>
                          <span className="font-medium tabular-nums">{brl(Number(value))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie data={data.categorias} dataKey="valor" nameKey="categoria" innerRadius={74} outerRadius={104} strokeWidth={3} stroke="var(--card)" paddingAngle={1}>
                  {data.categorias.map((c, i) => (
                    <Cell key={c.categoria} fill={CATEGORIA_CORES[i % CATEGORIA_CORES.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold tabular-nums">{brlShort(total)}</span>
              <span className="text-xs text-muted-foreground">no mês</span>
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {data?.categorias.map((c, i) => (
            <li key={c.categoria} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CATEGORIA_CORES[i % CATEGORIA_CORES.length] }} />
              <span className="flex-1 truncate">{c.categoria}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round((c.valor / total) * 100)}%</span>
              <span className="w-24 text-right font-medium whitespace-nowrap tabular-nums">{brlShort(c.valor)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
