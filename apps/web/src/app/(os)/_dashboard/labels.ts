/** `YYYY-MM-DD` from the API to a local Date (never through UTC, which would shift the day). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
