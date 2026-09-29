import { api } from "./client";
import type { Paged } from "./types";

export type QueryValue = string | number | boolean | null | undefined | readonly string[];

/** `?a=1&b=x&b=y` from an object; empty strings, empty arrays and nullish values are left out. */
export function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/**
 * One page of a listing. The shape is checked before use: an API from an older build answers a
 * plain array, and the screen should say so instead of crashing on a missing field.
 */
export async function fetchPage<T>(url: string): Promise<Paged<T>> {
  const result = await api<unknown>(url);
  const paged = result as Partial<Paged<T>> | null;
  if (!paged || !Array.isArray(paged.content) || typeof paged.page?.totalElements !== "number") {
    throw new Error(
      "A API respondeu num formato inesperado para esta lista. Se ela foi atualizada há pouco, reinicie a API.",
    );
  }
  return paged as Paged<T>;
}

/** Largest page the API serves (PageQuery.MAX_SIZE). */
export const MAX_PAGE_SIZE = 100;

/**
 * Every item of a paginated listing, page after page, for pickers that need the whole set (roles
 * in the role picker). Stops at `limit` items so a huge table never loads into the browser.
 */
export async function fetchAll<T>(path: string, params: Record<string, QueryValue> = {}, limit = 1000): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; items.length < limit; page++) {
    const result = await fetchPage<T>(`${path}${toQuery({ ...params, page, size: MAX_PAGE_SIZE })}`);
    items.push(...result.content);
    if (page + 1 >= result.page.totalPages) break;
  }
  return items.slice(0, limit);
}
