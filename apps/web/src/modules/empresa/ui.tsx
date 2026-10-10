import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CircleCheck,
  Clock,
  Database,
  FileText,
  FolderOpen,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Ship,
  Sheet,
  Sparkles,
  Thermometer,
  UserRoundPen,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorMarca, IconeKey } from "./types";

// ---- formatting -----------------------------------------------------------------------------------

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** R$ 1,2 mi / R$ 336 mil, for indicators and column totals. */
export function brlShort(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl(value);
}

export const num = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export const pct = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** `YYYY-MM-DD` to a local date at noon, so no time zone moves it to another day. */
export const dateOf = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

export const shortDate = (iso: string) => dateOf(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");

export function daysUntil(iso: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((dateOf(iso).getTime() - today.getTime()) / 86_400_000);
}

export function inDays(iso: string) {
  const days = daysUntil(iso);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

/** "há 12 min", "há 3 h", "ontem", "há 4 dias": short, for cards. */
export function ago(iso: string | null) {
  if (!iso) return "nunca";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter((part) => part.length > 2 || /^[A-Z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// ---- icons of the automation flows ----------------------------------------------------------------

export const ICONE: Record<IconeKey, LucideIcon> = {
  relogio: Clock,
  calendario: CalendarDays,
  erp: Database,
  email: Mail,
  whatsapp: MessageCircle,
  crm: UserRoundPen,
  ia: Sparkles,
  documento: FileText,
  alerta: Bell,
  navio: Ship,
  planilha: Sheet,
  relatorio: BarChart3,
  usuarios: UsersRound,
  check: CircleCheck,
  pasta: FolderOpen,
  dinheiro: Wallet,
  anuncio: Megaphone,
  sincronizar: RefreshCw,
  termometro: Thermometer,
  chat: MessagesSquare,
};

export const BotIcon = Bot;

// ---- logo-like badges of tools and banks ----------------------------------------------------------

/** Each tool keeps its own colour, like its logo would; the portal's brand stays in the tokens. */
const COR: Record<CorMarca, string> = {
  red: "bg-red-500 text-white",
  orange: "bg-orange-500 text-white",
  amber: "bg-amber-500 text-white",
  yellow: "bg-yellow-400 text-yellow-950",
  green: "bg-green-500 text-white",
  emerald: "bg-emerald-600 text-white",
  teal: "bg-teal-500 text-white",
  sky: "bg-sky-500 text-white",
  blue: "bg-blue-600 text-white",
  indigo: "bg-indigo-600 text-white",
  violet: "bg-violet-600 text-white",
  purple: "bg-purple-700 text-white",
  pink: "bg-pink-500 text-white",
  slate: "bg-slate-600 text-white",
  black: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900",
  stone: "bg-stone-500 text-white",
};

export function LogoBadge({ sigla, cor, className }: { sigla: string; cor: CorMarca; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tracking-tight shadow-sm ring-1 ring-black/5",
        COR[cor],
        className,
      )}
    >
      {sigla}
    </div>
  );
}

/** Small coloured dot with an optional soft halo when "live". */
export function StatusDot({ tone, pulse = false }: { tone: "ok" | "warn" | "error" | "idle"; pulse?: boolean }) {
  const color = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    error: "bg-red-500",
    idle: "bg-muted-foreground/40",
  }[tone];
  return (
    <span className="relative flex size-2 shrink-0">
      {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", color)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

/** Initials in a circle tinted with the brand, for owners of deals and users of a tool. */
export function Pessoa({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary ring-2 ring-card",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
