"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Blocks, Bot, Clock, MessagesSquare, Plug, RefreshCw, ScrollText, Settings2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/core/api/client";
import { useLoad } from "@/core/api/useLoad";
import { ErrorState, notifyError, notifySuccess } from "@/core/ui/feedback";
import { PageHeader } from "@/core/ui/page-header";
import { StatCard, StatGrid } from "@/core/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Ferramenta, IaConectada, IntegracoesView, StatusIntegracao } from "./types";
import { ago, LogoBadge, num, Pessoa, StatusDot } from "./ui";

function StatusPill({ status }: { status: StatusIntegracao }) {
  if (status === "CONECTADO") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <StatusDot tone="ok" />
        Conectado
      </span>
    );
  }
  if (status === "REAUTENTICAR") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <StatusDot tone="warn" />
        Precisa reautenticar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <StatusDot tone="idle" />
      Disponível
    </span>
  );
}

function Acao({ status, busy, onConnect }: { status: StatusIntegracao; busy: boolean; onConnect: () => void }) {
  if (status === "CONECTADO") {
    return (
      <Button variant="ghost" size="sm" onClick={() => notifySuccess("Configurações", "Na demonstração as permissões da integração ficam como estão.")}>
        <Settings2 data-icon="inline-start" />
        Configurar
      </Button>
    );
  }
  if (status === "REAUTENTICAR") {
    return (
      <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-700 hover:text-amber-800 dark:text-amber-400" onClick={onConnect} disabled={busy}>
        {busy ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
        Reautenticar
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={onConnect} disabled={busy}>
      {busy ? <Spinner data-icon="inline-start" /> : <Plug data-icon="inline-start" />}
      Conectar
    </Button>
  );
}

function FerramentaCard({ ferramenta: f, busy, onConnect }: { ferramenta: Ferramenta; busy: boolean; onConnect: () => void }) {
  return (
    <Card className={cn("gap-0 py-0 transition-shadow hover:shadow-md", f.status === "DISPONIVEL" && "bg-muted/30 shadow-none")}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <LogoBadge sigla={f.sigla} cor={f.cor} className={cn(f.status === "DISPONIVEL" && "opacity-70 grayscale-[35%]")} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate font-semibold">{f.nome}</span>
            <span className="truncate text-xs text-muted-foreground">{f.categoria}</span>
          </div>
          <StatusPill status={f.status} />
        </div>
        {f.destaque && (
          <Badge className="-mt-1">
            <ShieldCheck />
            {f.destaque}
          </Badge>
        )}
        <div className="flex flex-wrap gap-1.5">
          {f.sincroniza.map((item) => (
            <span key={item} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            f.status === "REAUTENTICAR" ? "text-amber-700 dark:text-amber-400" : f.status === "DISPONIVEL" ? "text-muted-foreground" : "",
          )}
        >
          {f.status === "REAUTENTICAR" ? <TriangleAlert className="size-3.5 shrink-0" /> : <Activity className="size-3.5 shrink-0 text-primary" />}
          <span className="truncate">{f.uso}</span>
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {f.sincronizadoEm ? `Sincronizado ${ago(f.sincronizadoEm)}` : "Nunca sincronizado"}
          </span>
          <Acao status={f.status} busy={busy} onConnect={onConnect} />
        </div>
      </CardContent>
    </Card>
  );
}

const tokens = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : num(value);

function IaCard({ ia, busy, onConnect }: { ia: IaConectada; busy: boolean; onConnect: () => void }) {
  const ativa = ia.status !== "DISPONIVEL";
  return (
    <Card
      className={cn(
        "gap-0 py-0 transition-shadow hover:shadow-md",
        ia.principal && "border-primary/30 bg-linear-to-br from-primary/5 via-card to-card",
        !ativa && "bg-muted/30 shadow-none",
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <LogoBadge sigla={ia.sigla} cor={ia.cor} className={cn("size-12 text-base", !ativa && "opacity-70 grayscale-[35%]")} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex items-center gap-2 text-lg leading-tight font-semibold">{ia.nome}</span>
            <span className="truncate text-xs text-muted-foreground">{ia.fornecedor}</span>
            <span className="mt-1 w-fit max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{ia.modelo}</span>
          </div>
          <StatusPill status={ia.status} />
        </div>
        {ia.principal && (
          <Badge className="-mt-1">
            <Sparkles />
            Assistente principal do portal
          </Badge>
        )}
        <p className="text-sm text-muted-foreground">{ia.usadoPara}</p>
        {ativa ? (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-xl border bg-background/60 p-3">
              <div className="grid gap-0.5">
                <span className="text-lg font-semibold tabular-nums">{num(ia.conversasMes)}</span>
                <span className="text-[11px] text-muted-foreground">conversas no mês</span>
              </div>
              <div className="grid gap-0.5">
                <span className="text-lg font-semibold tabular-nums">{ia.horasMes} h</span>
                <span className="text-[11px] text-muted-foreground">economizadas</span>
              </div>
              <div className="grid gap-0.5">
                <span className="text-lg font-semibold tabular-nums">{tokens(ia.tokensMes)}</span>
                <span className="text-[11px] text-muted-foreground">tokens</span>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {ia.usuarios.slice(0, 5).map((u) => (
                    <Pessoa key={u} name={u} className="size-7" />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {ia.usuarios.length} {ia.usuarios.length === 1 ? "pessoa usa" : "pessoas usam"}
                </span>
              </div>
              <Acao status={ia.status} busy={busy} onConnect={onConnect} />
            </div>
          </>
        ) : (
          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">Entra com as mesmas regras de acesso e registro</span>
            <Acao status={ia.status} busy={busy} onConnect={onConnect} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Blocks; title: string; description: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Icon className="size-5 text-primary" />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function IntegracoesPage() {
  const { data, error, retry, refresh } = useLoad((signal) => api<IntegracoesView>("/api/empresa/integracoes", { signal }));
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(id: string, nome: string) {
    setBusy(id);
    try {
      await api(`/api/empresa/integracoes/${id}`, { method: "POST" });
      notifySuccess(`${nome} conectado`, "A primeira sincronização começou.");
      await refresh();
    } catch (e) {
      notifyError(e, "Não foi possível conectar");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState error={error} onRetry={retry} />;

  const ferramentasOn = data?.ferramentas.filter((f) => f.status !== "DISPONIVEL").length ?? 0;
  const iasOn = data?.ias.filter((i) => i.status !== "DISPONIVEL").length ?? 0;
  const atencao = data ? [...data.ferramentas, ...data.ias].filter((i) => i.status === "REAUTENTICAR") : [];

  return (
    <>
      <PageHeader
        title="Integrações"
        description="As ferramentas e as IAs que o time usa, ligadas ao portal e aos dados da empresa."
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/audit">
              <ScrollText data-icon="inline-start" />
              Registro de uso
            </Link>
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          icon={Blocks}
          label="Ferramentas conectadas"
          value={data ? ferramentasOn : null}
          hint={data ? `de ${data.ferramentas.length} disponíveis` : "Disponíveis"}
        />
        <StatCard icon={RefreshCw} label="Registros sincronizados no mês" value={data ? num(data.stats.registrosMes) : null} hint="E-mails, tarefas, lançamentos e mensagens" />
        <StatCard
          icon={Bot}
          label="IAs conectadas"
          value={data ? iasOn : null}
          footer={data && `${num(data.ias.reduce((s, i) => s + i.conversasMes, 0))} conversas no mês`}
          hint="Com os dados da empresa e registro de uso"
        />
        <StatCard
          icon={TriangleAlert}
          label="Pedem atenção"
          value={data ? atencao.length : null}
          footer={atencao.length > 0 && <span className="text-amber-700 dark:text-amber-400">{atencao.map((i) => i.nome).join(", ")}</span>}
          hint="Autorização expirada ou erro de sincronização"
        />
      </StatGrid>

      <section className="flex flex-col gap-4">
        <SectionTitle icon={Blocks} title="Ferramentas conectadas" description="O portal lê e escreve nas ferramentas que o time já usa, sem trocar nenhuma delas." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!data
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)
            : data.ferramentas.map((f) => <FerramentaCard key={f.id} ferramenta={f} busy={busy === f.id} onConnect={() => void connect(f.id, f.nome)} />)}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle
          icon={MessagesSquare}
          title="IAs conectadas"
          description="Todas as IAs do time num lugar só, com os dados da empresa e o registro de quem usou o quê."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {!data
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)
            : data.ias.map((ia) => <IaCard key={ia.id} ia={ia} busy={busy === ia.id} onConnect={() => void connect(ia.id, ia.nome)} />)}
        </div>
      </section>
    </>
  );
}
