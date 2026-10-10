import {
  CalendarClock,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  Mail,
  PackageX,
  RefreshCcw,
  TrendingUp,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/core/api/client";
import { announceDataChanged, useLoad } from "@/core/api/useLoad";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import type { TaskSummary } from "@/modules/tasks/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AVISO_LABEL, COMBINADO_LABEL, CONTINUIDADE_LABEL, ENTREGAVEL_LABEL, FASES, FASE_LABEL, FONTE_LABEL } from "./labels";
import type {
  ConsultoriaResumo,
  Continuidade,
  Evento,
  Fase,
  FonteReuniao,
  StatusCombinado,
  StatusEntregavel,
  TipoAviso,
} from "./types";

/** Numbers of the whole consultancy: the dashboard indicators and the header of each tab. */
export function useResumo() {
  return useLoad((signal) => api<ConsultoriaResumo>("/api/consultoria/resumo", { signal }));
}

/**
 * Turns items agreed in a meeting that nobody took into tasks, for the owner and due date the
 * assistant suggested: all of them (null) or the ids given. Every screen reloads afterwards.
 */
export async function criarTarefasDosCombinados(ids: string[] | null): Promise<boolean> {
  try {
    const created = await api<TaskSummary[]>("/api/consultoria/combinados/tarefas", { method: "POST", body: ids ? { ids } : {} });
    const nomes = [...new Set(created.map((t) => t.assignee?.name.split(" ")[0]).filter(Boolean))];
    notifySuccess(
      created.length === 1 ? "Tarefa criada" : `${created.length} tarefas criadas`,
      nomes.length ? `Para ${nomes.join(", ")}, com prazo. Já aparecem em Tarefas.` : undefined,
    );
    announceDataChanged();
    return true;
  } catch (e) {
    notifyError(e, "Não foi possível criar as tarefas");
    return false;
  }
}

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** R$ 1,2 mi / R$ 17,5 mil, for indicators. */
export function brlShort(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sign}${brl(abs)}`;
}

export const pct = (value: number) => `${Math.round(value)}%`;
export const horas = (value: number) => `${value.toLocaleString("pt-BR")}h`;

const DAY = 86_400_000;

/** `YYYY-MM-DD` to a local date at noon, so no time zone moves it to another day. */
export const dateOf = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

export const daysUntil = (iso: string) => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((dateOf(iso.slice(0, 10)).getTime() - today.getTime()) / DAY);
};

export const formatDay = (iso: string) => dateOf(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
export const shortDay = (iso: string) => dateOf(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** "terça, 06/10", as the team cites a meeting. */
export const weekDay = (iso: string) =>
  `${dateOf(iso).toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "")}, ${shortDay(iso)}`;

export function inDays(iso: string) {
  const days = daysUntil(iso);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

export const firstName = (name: string) => name.split(" ")[0];

/** First letter in lower case, unless the word is an acronym ("CD de Ponta Grossa"). */
export const lowerFirst = (s: string) => (/^[A-ZÀ-Ú]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** Red from 10% above the budget, amber above it, the brand colour inside it. */
export const estouroTone = (estouro: number) => (estouro >= 10 ? "bg-destructive" : estouro > 0 ? "bg-amber-500" : "bg-primary");
export const estouroText = (estouro: number) =>
  estouro >= 10 ? "text-destructive" : estouro > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";

/** Margin below zero in red, below the consultancy's target in amber. */
export const margemText = (margem: number, meta = 35) =>
  margem < 0 ? "text-destructive" : margem < meta ? "text-amber-700 dark:text-amber-400" : "";

/**
 * Hours as a bar on the scale of the largest of budget and projection: logged hours solid, the
 * projection to completion lighter, and a tick where the budget ends.
 */
export function HorasBar({
  orcadas,
  lancadas,
  projetadas,
  estouro,
  className,
}: {
  orcadas: number;
  lancadas: number;
  projetadas: number;
  estouro: number;
  className?: string;
}) {
  const scale = Math.max(orcadas, lancadas, projetadas);
  const tone = estouroTone(estouro);
  return (
    <div className={cn("relative h-2 w-full overflow-visible rounded-full bg-muted", className)}>
      <div className={cn("absolute inset-y-0 left-0 rounded-full opacity-30", tone)} style={{ width: `${(projetadas / scale) * 100}%` }} />
      <div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${(lancadas / scale) * 100}%` }} />
      {projetadas > orcadas && (
        <div
          className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/70"
          style={{ left: `calc(${(orcadas / scale) * 100}% - 1px)` }}
          title={`Orçado: ${orcadas}h`}
        />
      )}
    </div>
  );
}

/** The four phases as segments, the current one marked; retainers show a single "mensal" label. */
export function FaseSteps({ fase, className }: { fase: Fase; className?: string }) {
  if (fase === "ACOMPANHAMENTO") {
    return (
      <Badge variant="secondary" className={className}>
        {FASE_LABEL[fase]}
      </Badge>
    );
  }
  const current = FASES.indexOf(fase);
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex gap-1">
        {FASES.map((f, i) => (
          <span
            key={f}
            title={FASE_LABEL[f]}
            className={cn("h-1.5 flex-1 rounded-full", i < current ? "bg-primary" : i === current ? "bg-primary/60" : "bg-muted")}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{FASE_LABEL[fase]}</span>
    </div>
  );
}

export const COMBINADO_ICON: Record<StatusCombinado, LucideIcon> = {
  FEITO: CircleCheck,
  EM_ANDAMENTO: Clock,
  ATRASADO: CircleAlert,
  SEM_RESPONSAVEL: UserRoundX,
};

export const COMBINADO_TONE: Record<StatusCombinado, string> = {
  FEITO: "text-emerald-600 dark:text-emerald-400",
  EM_ANDAMENTO: "text-muted-foreground",
  ATRASADO: "text-amber-600 dark:text-amber-400",
  SEM_RESPONSAVEL: "text-destructive",
};

export function CombinadoBadge({ status }: { status: StatusCombinado }) {
  const Icon = COMBINADO_ICON[status];
  if (status === "SEM_RESPONSAVEL") {
    return (
      <Badge variant="destructive">
        <Icon />
        {COMBINADO_LABEL[status]}
      </Badge>
    );
  }
  if (status === "ATRASADO") {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
        <Icon />
        {COMBINADO_LABEL[status]}
      </Badge>
    );
  }
  return (
    <Badge variant={status === "FEITO" ? "secondary" : "outline"}>
      <Icon />
      {COMBINADO_LABEL[status]}
    </Badge>
  );
}

export function EntregavelBadge({ status }: { status: StatusEntregavel }) {
  if (status === "ATRASADO") return <Badge variant="destructive">{ENTREGAVEL_LABEL[status]}</Badge>;
  if (status === "APROVACAO_CLIENTE") {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
        {ENTREGAVEL_LABEL[status]}
      </Badge>
    );
  }
  if (status === "ENTREGUE") {
    return (
      <Badge variant="secondary">
        <CircleCheck />
        {ENTREGAVEL_LABEL[status]}
      </Badge>
    );
  }
  return <Badge variant="outline">{ENTREGAVEL_LABEL[status]}</Badge>;
}

/** Continuity of a project: red only when it ends soon with nothing proposed. */
export function ContinuidadeBadge({ status, dias }: { status: Continuidade; dias: number }) {
  if (status === "SEM_PROPOSTA" && dias <= 15) {
    return (
      <Badge variant="destructive">
        <RefreshCcw />
        {CONTINUIDADE_LABEL[status]}
      </Badge>
    );
  }
  if (status === "PROPOSTA_ENVIADA" || status === "EM_CONVERSA") {
    return (
      <Badge variant="outline" className="border-primary/40 text-primary">
        {CONTINUIDADE_LABEL[status]}
      </Badge>
    );
  }
  if (status === "RECORRENTE") return <Badge variant="secondary">{CONTINUIDADE_LABEL[status]}</Badge>;
  return <span className="text-sm text-muted-foreground">{CONTINUIDADE_LABEL[status]}</span>;
}

export const AVISO_ICON: Record<TipoAviso, LucideIcon> = {
  SEM_RESPONSAVEL: UserRoundX,
  SEM_CONTINUIDADE: RefreshCcw,
  HORAS_ACIMA: TrendingUp,
  ENTREGA_ATRASADA: PackageX,
};

export function AvisoBadge({ tipo }: { tipo: TipoAviso }) {
  const Icon = AVISO_ICON[tipo];
  if (tipo === "SEM_RESPONSAVEL" || tipo === "HORAS_ACIMA") {
    return (
      <Badge variant="destructive">
        <Icon />
        {AVISO_LABEL[tipo]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
      <Icon />
      {AVISO_LABEL[tipo]}
    </Badge>
  );
}

/** Small mark of where a meeting was transcribed. */
export function OrigemTag({ origem }: { origem: FonteReuniao }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", origem === "MEET" ? "bg-emerald-500" : "bg-sky-500")} />
      {FONTE_LABEL[origem]}
    </span>
  );
}

export const EVENTO_ICON: Record<Evento["tipo"], LucideIcon> = {
  REUNIAO: CalendarDays,
  EMAIL: Mail,
  HORAS: Clock,
  PROPOSTA: FileText,
};

export const PrazoIcon = CalendarClock;
