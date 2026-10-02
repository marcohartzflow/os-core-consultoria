"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  functionalUpdate,
  useTable,
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
  type SortingState,
  type Updater,
  type ColumnVisibilityState,
} from "@tanstack/react-table";
import { fetchCursorPage, fetchPage, toQuery, type CursorPage, type QueryValue } from "@/core/api/query";
import type { Paged } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { dataTableFeatures, PAGE_SIZES, type DataTableColumnDef } from "./features";

const SEARCH_DELAY_MS = 300;

export interface ServerTableOptions<TData extends RowData> {
  /** API listing that answers {content, page} (PagedModel). */
  path: string;
  /**
   * Column ids the API accepts in `sort` (its SORTABLE list). Only these columns offer sorting;
   * any other column would send a sort the API refuses.
   */
  sortable: readonly string[];
  columns: DataTableColumnDef<TData>[];
  /** Column ids used as multi-choice filters; their values travel in the URL under the same name. */
  filters?: readonly string[];
  /**
   * Single-value parameters kept in the URL beside the search box (an e-mail, an id, a date).
   * Edit them with `setDraft` (sent after a pause in typing) or `setValues` (sent at once).
   */
  scalars?: readonly string[];
  /**
   * Turns filters and scalars into API parameters when names or shapes differ; without it both go
   * under their own names.
   */
  toParams?: (filters: Record<string, string[]>, scalars: Record<string, string>) => Record<string, QueryValue>;
  /** Sort the API applies when the URL names none; shown in the column header. */
  defaultSort?: { id: string; desc: boolean };
  /** Parameters always sent (a fixed scope of the screen). */
  fixed?: Record<string, QueryValue>;
  pageSize?: number;
  /**
   * Pages by position instead of page number (an API that answers {content, next, previous,
   * total, totalExact}, such as the audit trail). Every page then costs the same however deep it
   * is; the footer offers first, previous, next and last instead of "page X of Y".
   */
  cursor?: boolean;
  initialVisibility?: ColumnVisibilityState;
  getRowId: (row: TData) => string;
}

function readInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * A table whose rows come a page at a time from the API: pagination, sorting, text search and
 * filters are sent as query parameters and the database does the work, exactly as the API
 * contract says (PageQuery on the server). The state lives in the page URL, so reload, back and a
 * shared link show the same rows. URL: q, one key per filter (repeated), sort=field,desc, page
 * (1-based) and size.
 */
export function useServerTable<TData extends RowData>(options: ServerTableOptions<TData>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultSize = options.pageSize ?? 20;
  const filterIds = options.filters ?? [];
  const scalarIds = options.scalars ?? [];

  const q = params.get("q") ?? "";
  const cursorMode = options.cursor ?? false;
  // Position of a cursor-paged table: after (older), before (newer) or the oldest page.
  const position = cursorMode
    ? { after: params.get("after") ?? undefined, before: params.get("before") ?? undefined, oldest: params.get("oldest") === "true" || undefined }
    : {};
  const pageIndex = cursorMode ? 0 : readInt(params.get("page"), 1, 1, 10_000) - 1;
  // A size the footer does not offer (an edited link) would leave its select empty: use the nearest one.
  const requestedSize = readInt(params.get("size"), defaultSize, 1, 100);
  const pageSize = PAGE_SIZES.reduce((best, size) =>
    Math.abs(size - requestedSize) < Math.abs(best - requestedSize) ? size : best,
  );
  // A sort on a field the API does not accept (an old or edited link) would fail every request.
  const rawSort = params.get("sort");
  const sortParam = rawSort && options.sortable.includes(rawSort.split(",")[0]) ? rawSort : null;
  const filterValues = useMemo(
    () => Object.fromEntries(filterIds.map((id) => [id, params.getAll(id)])) as Record<string, string[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterIds is a static list per screen
    [params],
  );

  const scalarValues = useMemo(
    () => Object.fromEntries(scalarIds.map((id) => [id, params.get(id) ?? ""])) as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scalarIds is a static list per screen
    [params],
  );
  const defaultSort = options.defaultSort;
  const sorting = useMemo<SortingState>(() => {
    if (!sortParam) return defaultSort ? [defaultSort] : [];
    const [id, direction] = sortParam.split(",");
    return id ? [{ id, desc: direction === "desc" }] : [];
  }, [sortParam, defaultSort]);
  const pagination = useMemo<PaginationState>(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);
  const columnFilters = useMemo<ColumnFiltersState>(
    () => filterIds.flatMap((id) => (filterValues[id].length ? [{ id, value: filterValues[id] }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterIds is a static list per screen
    [filterValues],
  );

  /** Writes the next URL state; any change other than the page itself goes back to page 1. */
  const navigate = useCallback(
    (patch: {
      q?: string;
      filters?: Record<string, string[]>;
      scalars?: Record<string, string>;
      sort?: string | null;
      page?: number;
      size?: number;
      /** Cursor tables: where to go; any other change goes back to the newest page. */
      position?: { after?: string; before?: string; oldest?: boolean };
    }) => {
      const next = {
        q: patch.q ?? q,
        filters: patch.filters ?? filterValues,
        scalars: patch.scalars ?? scalarValues,
        sort: patch.sort === undefined ? sortParam : patch.sort,
        page: patch.page ?? 0,
        size: patch.size ?? pageSize,
      };
      const query = toQuery({
        // Keep parameters of the screen that are not table state (e.g. ?convidar).
        ...Object.fromEntries(
          [...params.keys()]
            .filter(
              (key) =>
                !["q", "sort", "page", "size", "after", "before", "oldest", ...filterIds, ...scalarIds].includes(key),
            )
            .map((key) => [key, params.getAll(key)]),
        ),
        q: next.q.trim() || undefined,
        ...next.filters,
        ...Object.fromEntries(scalarIds.map((id) => [id, (next.scalars[id] ?? "").trim() || undefined])),
        sort: next.sort ?? undefined,
        page: next.page > 0 ? next.page + 1 : undefined,
        ...patch.position,
        size: next.size !== defaultSize ? next.size : undefined,
      });
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterIds is a static list per screen
    [q, filterValues, scalarValues, sortParam, pageSize, params, pathname, router, defaultSize],
  );

  // The search box answers at once; the URL (and the request) follow after a pause in typing.
  const [search, setSearch] = useState(q);
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    // The URL changed from outside (back button, a link): show its text. The URL keeps the text
    // trimmed, so an echo of what was typed ("foo " sent as "foo") must not eat the trailing space.
    setShownQ(q);
    if (q !== search.trim()) setSearch(q);
  }
  useEffect(() => {
    if (search.trim() === q.trim()) return;
    const timer = setTimeout(() => navigate({ q: search }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, q, navigate]);

  // Scalars have their own drafts, sent after the same pause; a change coming from the URL
  // (back button, a link, an immediate setValues) replaces them unless it is the one just sent.
  const normalize = (values: Record<string, string>) =>
    JSON.stringify(scalarIds.map((id) => (values[id] ?? "").trim()));
  const scalarKey = normalize(scalarValues);
  const [drafts, setDrafts] = useState(scalarValues);
  const [shownScalars, setShownScalars] = useState(scalarKey);
  const [sentScalars, setSentScalars] = useState(scalarKey);
  if (scalarKey !== shownScalars) {
    setShownScalars(scalarKey);
    if (scalarKey !== sentScalars) setDrafts(scalarValues);
  }
  const draftKey = normalize(drafts);
  useEffect(() => {
    if (draftKey === scalarKey) return;
    const timer = setTimeout(() => {
      setSentScalars(draftKey);
      navigate({ scalars: drafts });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftKey stands for drafts
  }, [draftKey, scalarKey, navigate]);

  const apiQuery = toQuery({
    ...options.fixed,
    q: q.trim() || undefined,
    ...(options.toParams
      ? options.toParams(filterValues, scalarValues)
      : { ...filterValues, ...Object.fromEntries(scalarIds.map((id) => [id, scalarValues[id].trim() || undefined])) }),
    ...(cursorMode ? position : { sort: sortParam ?? undefined, page: pageIndex }),
    size: pageSize,
  });
  const loaded = useLoad<Paged<TData> | CursorPage<TData>>(
    (signal) =>
      cursorMode
        ? fetchCursorPage<TData>(`${options.path}${apiQuery}`, signal)
        : fetchPage<TData>(`${options.path}${apiQuery}`, signal),
    apiQuery,
  );
  // Both shapes are read as a page; a cursor page is "page 1 of 1" holding its total.
  const cursorPage = cursorMode ? (loaded.data as CursorPage<TData> | null) : null;
  const page: Paged<TData> | null = cursorPage
    ? {
        content: cursorPage.content,
        page: { size: pageSize, number: 0, totalElements: cursorPage.total, totalPages: 1 },
      }
    : (loaded.data as Paged<TData> | null);

  // A page past the last one (an old link, or rows removed by an action) comes back empty while
  // the search still has rows: go to the last page instead of showing "nothing found".
  // Cursor tables: a position that no longer has rows (its entries filtered out) starts over.
  const lastPage = page ? Math.max(0, page.page.totalPages - 1) : 0;
  const positioned = !!(position.after || position.before || position.oldest);
  const pastTheEnd =
    !loaded.loading &&
    !!page &&
    page.content.length === 0 &&
    (cursorMode ? positioned && page.page.totalElements > 0 : pageIndex > lastPage);
  useEffect(() => {
    if (pastTheEnd) navigate({ page: lastPage });
  }, [pastTheEnd, lastPage, navigate]);

  const sortableColumns = useMemo(
    () => options.columns.map((column) => ({ ...column, enableSorting: options.sortable.includes(column.id ?? "") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortable is a static list per screen
    [options.columns],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns: sortableColumns,
    data: page?.content ?? (EMPTY as TData[]),
    getRowId: options.getRowId,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: page?.page.totalElements ?? 0,
    initialState: { columnVisibility: options.initialVisibility ?? {} },
    state: { pagination, sorting, columnFilters },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      // Cursor tables only change the size here; moving is done through `cursor`.
      const next = functionalUpdate(updater, pagination);
      navigate({ page: next.pageSize !== pageSize ? 0 : next.pageIndex, size: next.pageSize });
    },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [first] = functionalUpdate(updater, sorting);
      navigate({ sort: first ? `${first.id},${first.desc ? "desc" : "asc"}` : null });
    },
    onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => {
      const next = functionalUpdate(updater, columnFilters);
      navigate({
        filters: Object.fromEntries(
          filterIds.map((id) => [id, (next.find((f) => f.id === id)?.value as string[] | undefined) ?? []]),
        ),
      });
    },
  });

  return {
    table,
    page,
    /** Cursor tables: the total (exact or "at least") and the moves the footer offers. */
    cursor: cursorPage
      ? {
          total: cursorPage.total,
          totalExact: cursorPage.totalExact,
          atNewest: !positioned || cursorPage.previous === null,
          atOldest: cursorPage.next === null,
          newest: () => navigate({}),
          newer: () => cursorPage.previous && navigate({ position: { before: cursorPage.previous } }),
          older: () => cursorPage.next && navigate({ position: { after: cursorPage.next } }),
          oldest: () => navigate({ position: { oldest: true } }),
          pageSize,
          setPageSize: (size: number) => navigate({ size }),
        }
      : null,
    error: loaded.error,
    loading: loaded.loading,
    refresh: loaded.refresh,
    retry: loaded.retry,
    search,
    setSearch,
    filtered: q.trim() !== "" || columnFilters.length > 0 || scalarIds.some((id) => scalarValues[id].trim() !== ""),
    clearFilters: () => {
      const empty = Object.fromEntries(scalarIds.map((id) => [id, ""]));
      setSearch("");
      setDrafts(empty);
      setSentScalars(normalize(empty));
      navigate({ q: "", filters: Object.fromEntries(filterIds.map((id) => [id, []])), scalars: empty });
    },
    /** Scalars as they are in the URL (what the API received). */
    values: scalarValues,
    /** Scalars as typed; follow `values` once sent. */
    drafts,
    setDraft: (name: string, value: string) => setDrafts((current) => ({ ...current, [name]: value })),
    /**
     * Sends scalars at once (a date range, a chip). With `reset`, the search, the filters and every
     * other scalar are cleared first (e.g. "events of this person").
     */
    setValues: (patch: Record<string, string>, { reset = false }: { reset?: boolean } = {}) => {
      const base = reset ? Object.fromEntries(scalarIds.map((id) => [id, ""])) : drafts;
      const next = { ...base, ...patch };
      setDrafts(next);
      setSentScalars(normalize(next));
      if (reset) setSearch("");
      navigate({
        scalars: next,
        ...(reset ? { q: "", filters: Object.fromEntries(filterIds.map((id) => [id, []])) } : {}),
      });
    },
  };
}

const EMPTY: never[] = [];
