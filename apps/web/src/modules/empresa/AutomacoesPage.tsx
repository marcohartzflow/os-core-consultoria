"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Clock, Gauge, Hourglass, Plus, Timer, TriangleAlert, Workflow, Zap } from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState, notifyError, notifySuccess } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Automacao, AutomacoesView, Execucao, PassoAutomacao, ResultadoExecucao } from "./types";
import { ago, ICONE, num, pct, StatusDot } from "./ui";

/** Trigger → actions, drawn as icons joined by a line; the trigger is filled with the brand colour. */
function Fluxo({ passos, compact = false }: { passos: PassoAutomacao[]; compact?: boolean }) {
  return (
    <ol className="flex items-start">
      {passos.map((p, i) => {
        const Icon = ICONE[p.icone];
        const last = i === passos.length - 1;
        return (
          <li
            key={i}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 text-center",
              !last &&
                "after:absolute after:top-[17px] after:right-[calc(-50%+22px)] after:left-[calc(50%+22px)] after:h-px after:bg-linear-to-r after:from-primary/50 after:to-primary/20",
            )}
          >
            <span
              className={cn(
                "z-10 flex size-9 items-center justify-center rounded-xl",
                i === 0 ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary ring-1 ring-primary/15",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className={cn("line-clamp-2 leading-tight font-medium", compact ? "text-[10px]" : "text-[11px]")}>{p.texto}</span>
            {p.ferramenta && !compact && <span className="truncate text-[10px] text-muted-foreground">{p.ferramenta}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function saudeTone(a: Automacao): "ok" | "warn" | "error" | "idle" {
  if (!a.ativa) return "idle";
  return a.saude === "OK" ? "ok" : a.saude === "ATENCAO" ? "warn" : "error";
}

function AutomacaoCard({ automacao: a, onToggle }: { automacao: Automacao; onToggle: (ativa: boolean) => void }) {
  const tone = saudeTone(a);
  return (
    <Card className={cn("gap-4 transition-all hover:shadow-md", !a.ativa && "opacity-70")}>
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base leading-tight">
          <StatusDot tone={tone} pulse={a.ativa && tone === "ok"} />
          {a.nome}
        </CardTitle>
        <CardDescription className="line-clamp-2 min-h-10 text-xs leading-relaxed">{a.descricao}</CardDescription>
        <CardAction>
          <Switch checked={a.ativa} onCheckedChange={onToggle} aria-label={a.ativa ? `Pausar ${a.nome}` : `Ligar ${a.nome}`} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-xl border bg-muted/30 px-2 py-3">
          <Fluxo passos={a.passos} />
        </div>
        {a.aviso && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              a.saude === "ERRO" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            <TriangleAlert className="size-3.5" />
            {a.aviso}
          </div>
        )}
        <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-xs">
          <div className="grid gap-0.5">
            <span className="text-muted-foreground">Última</span>
            <span className="font-medium">{a.ativa ? ago(a.ultimaExecucao) : "pausada"}</span>
          </div>
          <div className="grid gap-0.5">
            <span className="text-muted-foreground">No mês</span>
            <span className="font-medium tabular-nums">{num(a.execucoesMes)} execuções</span>
          </div>
          <div className="grid gap-0.5 text-right">
            <span className="text-muted-foreground">Sucesso</span>
            <span className={cn("font-medium tabular-nums", a.sucesso < 90 && "text-destructive")}>{pct(a.sucesso)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const RESULTADO: Record<ResultadoExecucao, { label: string; className: string; icon: typeof CircleCheck }> = {
  SUCESSO: { label: "Sucesso", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400", icon: CircleCheck },
  FALHOU: { label: "Falhou", className: "border-destructive/40 text-destructive", icon: CircleX },
  APROVACAO: { label: "Aguardando aprovação", className: "border-amber-500/50 text-amber-700 dark:text-amber-400", icon: Hourglass },
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function ExecucaoRow({ execucao: e }: { execucao: Execucao }) {
  const r = RESULTADO[e.resultado];
  return (
    <li className="grid grid-cols-[88px_1fr_auto] items-center gap-4 px-6 py-3 sm:grid-cols-[88px_1fr_auto_64px]">
      <div className="grid gap-0.5 text-xs">
        <span className="font-medium tabular-nums">{hora(e.quando)}</span>
        <span className="text-muted-foreground">{ago(e.quando)}</span>
      </div>
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{e.automacao}</span>
        <span className="truncate text-xs text-muted-foreground">{e.detalhe}</span>
      </div>
      <Badge variant="outline" className={r.className}>
        <r.icon />
        {r.label}
      </Badge>
      <span className="hidden items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums sm:flex">
        <Timer className="size-3" />
        {e.duracaoSeg} s
      </span>
    </li>
  );
}

export function AutomacoesPage() {
  const { data, error, retry, refresh } = useLoad((signal) => api<AutomacoesView>("/api/empresa/automacoes", { signal }));
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [novaOpen, setNovaOpen] = useState(false);
  const s = data?.stats;

  async function toggle(a: Automacao, ativa: boolean) {
    setToggled((previous) => ({ ...previous, [a.id]: ativa }));
    try {
      await api(`/api/empresa/automacoes/${a.id}`, { method: "PATCH", body: { ativa } });
      notifySuccess(ativa ? "Automação ligada" : "Automação pausada", a.nome);
      await refresh();
    } catch (e) {
      setToggled((previous) => ({ ...previous, [a.id]: !ativa }));
      notifyError(e, "Não foi possível alterar a automação");
    }
  }

  if (error) return <ErrorState error={error} onRetry={retry} />;

  return (
    <>
      <PageHeader
        title="Automações"
        description="O trabalho repetitivo do time rodando sozinho, com registro de cada execução."
        actions={
          <Button onClick={() => setNovaOpen(true)}>
            <Plus data-icon="inline-start" />
            Nova automação
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          icon={Zap}
          label="Automações ativas"
          value={s ? s.ativas : null}
          hint={s ? `de ${s.total} configuradas` : "Configuradas"}
        />
        <StatCard icon={Workflow} label="Execuções no mês" value={s ? num(s.execucoesMes) : null} hint="Todas as automações" />
        <StatCard
          icon={Clock}
          label="Horas economizadas no mês"
          value={s ? `${s.horasMes} h` : null}
          footer={s && `${Math.round(s.horasMes / 8)} dias de trabalho de uma pessoa`}
          hint="Tempo que o time gastaria fazendo à mão"
        />
        <StatCard icon={Gauge} label="Taxa de sucesso" value={s ? pct(s.sucesso) : null} hint="Execuções concluídas sem erro" />
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {!data
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)
          : data.automacoes.map((a) => {
              const view = a.id in toggled ? { ...a, ativa: toggled[a.id] } : a;
              return <AutomacaoCard key={a.id} automacao={view} onToggle={(ativa) => void toggle(a, ativa)} />;
            })}
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Execuções recentes</CardTitle>
          <CardDescription>Cada execução fica registrada com resultado, duração e o que foi feito.</CardDescription>
          <CardAction>
            <Badge variant="secondary" className="gap-1.5">
              <StatusDot tone="ok" pulse />
              Ao vivo
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {!data ? (
            <div className="flex flex-col gap-2 px-6 pb-6">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y border-t">
              {[...data.execucoes]
                .sort((a, b) => b.quando.localeCompare(a.quando))
                .map((e) => (
                  <ExecucaoRow key={e.id} execucao={e} />
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova automação</DialogTitle>
            <DialogDescription>Comece por um modelo ou descreva para o assistente o que você quer automatizar.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {data?.modelos.map((m) => (
              <button
                key={m.nome}
                type="button"
                onClick={() => {
                  setNovaOpen(false);
                  notifySuccess("Rascunho criado", `${m.nome}: revise os passos e ligue quando quiser.`);
                }}
                className="flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">{m.nome}</span>
                  <span className="text-xs text-muted-foreground">{m.descricao}</span>
                </div>
                <Fluxo passos={m.passos} compact />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
