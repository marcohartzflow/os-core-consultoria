"use client";

import { useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts";
import {
  ChevronRight,
  CircleCheck,
  Clock,
  FolderKanban,
  ListPlus,
  MessageSquareQuote,
  RefreshCcw,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState } from "@/core/ui/feedback";
import { StatCard } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Avisos, AvisoContinuidade, Combinado, HorasView } from "./types";
import {
  brl,
  brlShort,
  criarTarefasDosCombinados,
  EVENTO_ICON,
  firstName,
  inDays,
  lowerFirst,
  margemText,
  OrigemTag,
  shortDay,
  useResumo,
  weekDay,
} from "./ui";

// ---- indicators -----------------------------------------------------------------------------------

export function ProjetosStat() {
  const { data, error } = useResumo();
  return (
    <StatCard
      icon={FolderKanban}
      label="Projetos em andamento"
      value={error ? "-" : data ? data.emAndamento : null}
      badge={data && <Badge variant="outline">{brlShort(data.valorEmCarteira)}</Badge>}
      hint={data ? `Em contrato; ${data.terminam30} terminam nos próximos 30 dias` : "Gestão, compliance, meio ambiente e estratégia"}
    />
  );
}

export function SemResponsavelStat() {
  const { data, error } = useResumo();
  return (
    <StatCard
      icon={UserRoundX}
      label="Combinados sem responsável"
      value={error ? "-" : data ? data.semResponsavel : null}
      badge={
        data &&
        (data.semResponsavel > 0 ? (
          <Badge variant="destructive">
            {data.reunioesComPendencia} {data.reunioesComPendencia === 1 ? "reunião" : "reuniões"}
          </Badge>
        ) : (
          <Badge variant="secondary">Todos com dono</Badge>
        ))
      }
      hint="Pedidos de cliente que não viraram tarefa"
    />
  );
}

export function HorasAcimaStat() {
  const { data, error } = useResumo();
  return (
    <StatCard
      icon={Clock}
      label="Horas acima do orçado"
      value={error ? "-" : data ? `${data.horasAcima}h` : null}
      badge={data && <Badge variant="destructive">{data.acimaDoOrcado} acima de 10%</Badge>}
      hint="Projeção ao fim de cada projeto, pelo % concluído"
    />
  );
}

export function RenovacaoStat() {
  const { data, error } = useResumo();
  return (
    <StatCard
      icon={RefreshCcw}
      label="Renovação em jogo"
      value={error ? "-" : data ? brlShort(data.renovacaoAno) : null}
      hint={
        data
          ? `Por ano, em ${data.semContinuidade} projetos que terminam em 15 dias sem proposta de continuidade`
          : "Por ano, nos projetos que terminam em 15 dias sem proposta de continuidade"
      }
    />
  );
}

// ---- the hero: what the assistant raised on its own --------------------------------------------

function Cruzou({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="mt-px size-3.5 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

const pedidos = (n: number) => (n === 1 ? "um pedido" : `${n} pedidos`);

/** One orphan item, large: what was asked, the words of the transcript and who the AI suggests. */
function ItemGrande({ item }: { item: Combinado }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-card/80 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="leading-snug font-medium">{item.texto}</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          sugestão: <span className="font-medium text-foreground">{firstName(item.sugerido)}</span> até {shortDay(item.prazoSugerido)}
        </span>
      </div>
      {item.trecho && (
        <p className="flex gap-1.5 text-sm leading-snug text-muted-foreground">
          <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="italic">“{item.trecho}”</span> {firstName(item.pedidoPor)}, aos {item.minuto} min
          </span>
        </p>
      )}
      {item.impacto && <p className="text-sm leading-snug font-medium text-destructive">{item.impacto}.</p>}
    </li>
  );
}

function CombinadosHero({ avisos, onCreate, creating }: { avisos: Avisos["combinados"]; onCreate: () => void; creating: boolean }) {
  const [principal, ...outros] = avisos.grupos;
  if (!principal) {
    return (
      <div className="flex flex-col items-start justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 lg:col-span-3">
        <CircleCheck className="size-6 text-emerald-600" />
        <h3 className="text-xl font-semibold">Todo combinado de reunião tem dono</h3>
        <p className="text-sm text-muted-foreground">Cada pedido das últimas reuniões virou tarefa com responsável e prazo.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/tasks?status=OPEN">Ver as tarefas</Link>
        </Button>
      </div>
    );
  }
  const r = principal.reuniao;
  const dia = weekDay(r.data).split(",")[0];
  const doCliente = r.participantes.filter((p) => p.lado === "CLIENTE").map((p) => firstName(p.nome));
  const resto = outros.flatMap((g) => g.itens.map((item) => ({ item, reuniao: g.reuniao })));
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="destructive">
          <UserRoundX />
          Combinado sem responsável
        </Badge>
        <span className="text-xs text-muted-foreground">
          {avisos.total} {avisos.total === 1 ? "item" : "itens"} em {avisos.reunioes} {avisos.reunioes === 1 ? "reunião" : "reuniões"} ·{" "}
          {avisos.clientes.join(", ")}
        </span>
      </div>

      <Link href={`/reunioes?reuniao=${r.id}`} className="group grid gap-1 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <h3 className="text-xl leading-tight font-semibold text-balance group-hover:underline">
          Na reunião de {dia}, a {r.apelido} fez {pedidos(principal.itens.length)} e ninguém ficou responsável
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>
            {r.titulo} · {weekDay(r.data)}, com {doCliente.join(" e ")}
          </span>
          <OrigemTag origem={r.origem} />
        </p>
      </Link>

      <ul className="flex flex-col gap-2">
        {principal.itens.map((item) => (
          <ItemGrande key={item.id} item={item} />
        ))}
      </ul>

      {resto.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Também sem responsável</span>
          <ul className="flex flex-col gap-1.5">
            {resto.map(({ item, reuniao }) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm leading-snug">
                <Link href={`/reunioes?reuniao=${reuniao.id}`} className="hover:underline">
                  <span className="font-medium">{reuniao.apelido}:</span> {item.texto}
                </Link>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {reuniao.fonte.replace(" · transcrição do", " ·")} · {inDays(reuniao.data)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-snug">
          <span className="font-medium">Sugestão: </span>
          dar dono a cada pedido hoje, com o prazo que o cliente espera. Cada tarefa vai para quem cuida daquela frente do projeto.
        </p>
        <Button onClick={onCreate} disabled={creating} className="shrink-0">
          {creating ? <Spinner data-icon="inline-start" /> : <ListPlus data-icon="inline-start" />}
          Criar {avisos.total === 1 ? "a tarefa" : `as ${avisos.total} tarefas`}
        </Button>
      </div>
      <Cruzou text={avisos.cruzou} />
    </div>
  );
}

function ContinuidadeItem({ aviso: a }: { aviso: AvisoContinuidade }) {
  const Icon = a.evento ? EVENTO_ICON[a.evento.tipo] : null;
  return (
    <Link
      href={`/projetos?ficha=${a.projetoId}`}
      className="flex flex-col gap-2 rounded-xl border bg-card/80 p-3.5 transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{a.apelido}</span>
        <span className="text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
          termina {inDays(a.fim)} ({shortDay(a.fim)})
        </span>
      </div>
      <span className="text-sm text-muted-foreground">
        {a.projeto} · {brlShort(a.valor)} · {firstName(a.socio)}
      </span>
      <p className="text-sm leading-snug">
        <span className="font-medium">Continuidade sugerida:</span> {lowerFirst(a.sugestao)},{" "}
        <span className="font-semibold whitespace-nowrap tabular-nums">{brl(a.valorMensal)}/mês</span>
      </p>
      {a.evento && Icon && (
        <p className="flex gap-1.5 text-sm leading-snug">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">{a.evento.fonte}: </span>
            {a.evento.texto}
          </span>
        </p>
      )}
      <Cruzou text={a.cruzou} />
    </Link>
  );
}

function ContinuidadeCard({ avisos }: { avisos: Avisos["continuidade"] }) {
  if (avisos.projetos.length === 0) {
    return (
      <div className="flex flex-col justify-center gap-2 rounded-2xl border p-5 lg:col-span-2">
        <CircleCheck className="size-5 text-emerald-600" />
        <span className="font-medium">Todo projeto que termina em {avisos.janelaDias} dias tem proposta de continuidade</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 lg:col-span-2">
      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
        <RefreshCcw />
        Termina sem continuidade
      </Badge>
      <div className="grid gap-1">
        <h3 className="text-lg leading-tight font-semibold text-balance">
          {avisos.projetos.length} {avisos.projetos.length === 1 ? "projeto termina" : "projetos terminam"} em até {avisos.janelaDias} dias e
          ninguém propôs o que vem depois
        </h3>
        <p className="text-sm text-muted-foreground">
          <span className="text-2xl font-semibold text-foreground tabular-nums">{brlShort(avisos.valorAno)}</span> por ano de renovação
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {avisos.projetos.map((a) => (
          <ContinuidadeItem key={a.projetoId} aviso={a} />
        ))}
      </div>
    </div>
  );
}

export function AvisosCard() {
  const { data, error, retry } = useLoad((signal) => api<Avisos>("/api/consultoria/avisos", { signal }));
  const [creating, setCreating] = useState(false);
  const total = data ? data.combinados.total + data.continuidade.projetos.length : 0;

  async function criar() {
    setCreating(true);
    await criarTarefasDosCombinados(null);
    setCreating(false);
  }

  return (
    <Card className="border-primary/25 bg-linear-to-br from-primary/5 via-card to-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          Avisos da IA
        </CardTitle>
        <CardDescription>
          A IA lê a transcrição de cada reunião, confere o que virou tarefa e o que ficou sem dono, e olha o fim de cada contrato contra o
          Comercial. Avisa antes de o cliente cobrar.
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {data && <Badge>{total} avisos hoje</Badge>}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reunioes">
              Reuniões
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={retry} className="p-4" />
        ) : !data ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <Skeleton className="h-[34rem] w-full rounded-2xl lg:col-span-3" />
            <Skeleton className="h-[34rem] w-full rounded-2xl lg:col-span-2" />
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <CombinadosHero avisos={data.combinados} onCreate={criar} creating={creating} />
            <ContinuidadeCard avisos={data.continuidade} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- chart ------------------------------------------------------------------------------------------

const horasConfig = {
  horasOrcadas: { label: "Orçado", color: "var(--chart-3)" },
  horasProjetadas: { label: "Projeção ao fim", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Linha = HorasView["projetos"][number] & { nome: string };

const fillOf = (estouro: number) =>
  estouro >= 10 ? "var(--destructive)" : estouro > 0 ? "var(--color-amber-500)" : "var(--color-horasProjetadas)";

function ProjecaoBar(props: BarShapeProps) {
  const linha = props.payload as Linha;
  return <Rectangle {...props} fill={fillOf(linha.estouro)} radius={3} />;
}

/** Budgeted against projected hours of each fixed-fee project, the biggest overrun first. */
export function HorasChart() {
  const { data, error, retry } = useLoad((signal) => api<HorasView>("/api/consultoria/horas", { signal }));
  // Fixed-fee projects only: their hours add up to one budget, so the bars compare like with like.
  const rows: Linha[] | undefined = data?.projetos.filter((h) => h.cobranca === "FIXO").map((h) => ({ ...h, nome: h.apelido }));
  return (
    <Card className="@container/card lg:col-span-2">
      <CardHeader>
        <CardTitle>Horas orçadas × projetadas por projeto</CardTitle>
        <CardDescription>Projeção = horas lançadas ÷ % concluído. Os que mais passam do orçado primeiro.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/horas">
              Horas
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {error ? (
          <ErrorState error={error} onRetry={retry} />
        ) : !rows ? (
          <Skeleton className="h-[420px] w-full" />
        ) : (
          <ChartContainer config={horasConfig} className="aspect-auto h-[420px] w-full">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="nome" type="category" tickLine={false} axisLine={false} width={110} tick={{ fontSize: 12 }} interval={0} />
              <XAxis type="number" hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name, item) => {
                      const h = item.payload as Linha;
                      if (name !== "horasProjetadas") return null;
                      return (
                        <div className="grid gap-0.5">
                          <span className="font-medium">
                            {h.projeto} · {h.apelido}
                          </span>
                          <span className="text-muted-foreground">
                            {h.horasLancadas}h lançadas de {h.horasOrcadas}h · {h.concluido}% feito · projeção {Number(value)}h (
                            {h.estouro > 0 ? "+" : ""}
                            {h.estouro}%)
                          </span>
                          <span className={cn("text-muted-foreground", margemText(h.margemAtual))}>Margem projetada {h.margemAtual}%</span>
                          {h.causa && (
                            <span className="text-muted-foreground">
                              +{h.causa.horas}h: {lowerFirst(h.causa.texto)}
                            </span>
                          )}
                        </div>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="horasOrcadas" fill="var(--color-horasOrcadas)" radius={3} />
              <Bar dataKey="horasProjetadas" shape={ProjecaoBar}>
                <LabelList
                  dataKey="estouro"
                  position="right"
                  className="fill-foreground text-xs tabular-nums"
                  formatter={(value: unknown) => `${Number(value) > 0 ? "+" : ""}${Number(value)}%`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
