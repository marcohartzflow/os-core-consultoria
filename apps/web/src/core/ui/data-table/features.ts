import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludesSome,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import type { Column, ColumnDef, ReactTable, RowData } from "@tanstack/react-table";

/**
 * The one feature set every list of the portal uses (TanStack Table v9 registers features
 * explicitly): text search, faceted filters, sorting, column visibility and client pagination.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, arrIncludesSome: filterFn_arrIncludesSome },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableInstance<TData extends RowData> = ReactTable<DataTableFeatures, TData>;
export type DataTableColumn<TData extends RowData> = Column<DataTableFeatures, TData, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns of one table hold different value types
export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;
