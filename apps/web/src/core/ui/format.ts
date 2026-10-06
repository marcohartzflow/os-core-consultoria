export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** Up to two initials for avatar fallbacks: "Maria da Silva" becomes "MD". */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "há 3 horas", "ontem", "agora"; pair with formatDateTime in a title for the exact moment. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "Nunca";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "agora";
}

/** Date only, day/month/year. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(iso));
}
