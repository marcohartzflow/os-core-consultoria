"use client";

import Link from "next/link";
import { BellRing, Clock, Percent, TrendingUp, UserRoundCheck } from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState, TableSkeleton } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { HorasChart } from "./ConsultoriaDashboard";
import type { HorasProjeto, HorasSemana, HorasView } from "./types";
import { estouroText, firstName, HorasBar, horas, margemText, pct, shortDay, useResumo } from "./ui";

/** Below this share of the 40h, the week counts as "falta lançar" (the reminder uses the same rule). */
const LIMITE = 0.8;

export function HorasPage() {
  const resumo = useResumo();
  const view = useLoad((signal) => api<HorasView>("/api/consultoria/horas", { signal }));
  const r = resumo.data;

  return (
    <>
      <PageHeader
        title="Horas"
        description="As horas que a equipe lançou em cada projeto contra o orçado, a projeção ao fim e quem ainda não lançou a semana."
      />

      <StatGrid>
        <StatCard
          icon={Clock}
          label="Horas lançadas nos projetos"
          value={r ? horas(r.horasLancadas) : null}
          hint={r ? `de ${horas(r.horasOrcadas)} orçadas nos projetos de preço fechado` : "Projetos de preço fechado"}
        />
        <StatCard
          icon={TrendingUp}
          label="Acima do orçado"
          value={r ? `${r.horasAcima}h` : null}
          badge={r && <Badge variant="destructive">{r.acimaDoOrcado} projetos +10%</Badge>}
          hint="Projeção ao fim, pelo % concluído"
        />
        <StatCard
          icon={Percent}
          label="Margem média"
          value={r ? pct(r.margemMedia) : null}
          badge={r && <Badge variant="outline">orçada {pct(r.margemPlanejadaMedia)}</Badge>}
          hint={r ? `Com as horas projetadas; meta de ${r.metaMargem}%` : "Com as horas projetadas"}
        />
        <StatCard
          icon={BellRing}
          label="Falta lançar a semana passada"
          value={r ? `${r.pessoasSemLancar} pessoas` : null}
          badge={r && <Badge variant="outline">{r.horasSemLancar}h</Badge>}
          hint="O lembrete de horas já avisou cada uma"
        />
      </StatGrid>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <HorasChart />
        <SemanaCard view={view.data} error={view.error} onRetry={view.retry} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-none">Horas por projeto</CardTitle>
          <CardDescription>
            Consumido é a parte das horas orçadas que já foi lançada; quando passa do % concluído, o projeto vai fechar acima do orçado.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {view.error ? (
            <ErrorState error={view.error} onRetry={view.retry} />
          ) : !view.data ? (
            <TableSkeleton columns={6} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Projeto</th>
                    <th className="px-3 py-2 text-left font-medium">Horas lançadas / orçadas</th>
                    <th className="px-3 py-2 text-right font-medium">Feito</th>
                    <th className="px-3 py-2 text-right font-medium">Consumido</th>
                    <th className="px-3 py-2 text-right font-medium">Projeção</th>
                    <th className="px-3 py-2 text-right font-medium">Margem</th>
                    <th className="px-4 py-2 text-left font-medium">Por que passou</th>
                  </tr>
                </thead>
                <tbody>
                  {view.data.projetos.map((h) => (
                    <ProjetoRow key={h.projetoId} horas={h} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ProjetoRow({ horas: h }: { horas: HorasProjeto }) {
  const mensal = h.cobranca === "MENSAL";
  const passou = !mensal && h.concluido !== null && h.consumido > h.concluido;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <Link href={`/projetos?ficha=${h.projetoId}`} className="grid w-48 gap-0.5 hover:underline">
          <span className="truncate font-medium">{h.apelido}</span>
          <span className="truncate text-xs text-muted-foreground">
            {h.projeto} · {firstName(h.responsavel)}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        <div className="grid w-44 gap-1.5">
          <span className="tabular-nums">
            {h.horasLancadas}h <span className="text-muted-foreground">/ {h.horasOrcadas}h{mensal ? " por mês" : ""}</span>
          </span>
          <HorasBar orcadas={h.horasOrcadas} lancadas={h.horasLancadas} projetadas={h.horasProjetadas} estouro={h.estouro} />
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{mensal ? <span className="text-muted-foreground">Mensal</span> : pct(h.concluido ?? 0)}</td>
      <td className={cn("px-3 py-3 text-right font-medium tabular-nums", passou && estouroText(h.estouro))}>{pct(h.consumido)}</td>
      <td className={cn("px-3 py-3 text-right whitespace-nowrap tabular-nums", estouroText(h.estouro))}>
        {mensal ? "-" : `${h.horasProjetadas}h (${h.estouro > 0 ? "+" : ""}${h.estouro}%)`}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
        <span className={cn("font-medium", margemText(h.margemAtual))}>{pct(h.margemAtual)}</span>
        <span className="text-xs text-muted-foreground"> / {pct(h.margemPlanejada)}</span>
      </td>
      <td className="px-4 py-3">
        {h.causa ? (
          <span className="line-clamp-3 block w-64 text-sm leading-snug">
            <span className="font-semibold text-destructive tabular-nums">+{h.causa.horas}h</span> {h.causa.texto}
            <span className="text-muted-foreground"> · {h.causa.fonte}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{h.estouro > 0 ? "Dentro da margem" : "No orçamento"}</span>
        )}
      </td>
    </tr>
  );
}

function PessoaRow({ pessoa: p }: { pessoa: HorasSemana }) {
  const falta = p.lancadas < p.esperadas * LIMITE;
  return (
    <li className="grid gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">
          {p.nome} <span className="text-xs text-muted-foreground">· {p.nivel}</span>
        </span>
        <span className={cn("whitespace-nowrap tabular-nums", falta && "font-medium text-destructive")}>
          {p.lancadas}h <span className="font-normal text-muted-foreground">/ {p.esperadas}h</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", falta ? "bg-destructive" : "bg-primary")}
          style={{ width: `${Math.min(100, (p.lancadas / p.esperadas) * 100)}%` }}
        />
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {falta && <span className="font-medium text-destructive">Faltam {p.esperadas - p.lancadas}h · </span>}
        {p.projetos.map((x) => `${x.apelido} ${x.horas}h`).join(", ")}
      </span>
    </li>
  );
}

function SemanaCard({ view, error, onRetry }: { view: HorasView | null; error: unknown; onRetry: () => void }) {
  const pessoas = view?.semana.pessoas ?? [];
  const faltando = pessoas.filter((p) => p.lancadas < p.esperadas * LIMITE);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRoundCheck className="size-4 text-primary" />
          Semana passada
        </CardTitle>
        <CardDescription>
          {view ? `${shortDay(view.semana.inicio)} a ${shortDay(view.semana.fim)}, 40h por pessoa. ` : ""}
          {faltando.length ? `${faltando.length} pessoas abaixo de 32h receberam o lembrete.` : "Todo mundo lançou a semana."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !view ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="flex max-h-[430px] flex-col divide-y overflow-y-auto pr-1">
            {pessoas.map((p) => (
              <PessoaRow key={p.nome} pessoa={p} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
