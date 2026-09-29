"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  EyeOff,
  ListFilter,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import type { RowData } from "@tanstack/react-table";
import type { DataTableColumn, DataTableInstance } from "./features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Table body of a list: header row, rows, and `empty` when nothing matches. Cells line up with
 * the padding of the Card around it. Built on TanStack Table (the shadcn data table guide).
 */
export function DataTable<TData extends RowData>({
  table,
  empty,
  onRowClick,
}: {
  table: DataTableInstance<TData>;
  empty: ReactNode;
  /** Opens the row; keyboard users get the same through the link or button inside the row. */
  onRowClick?: (row: TData) => void;
}) {
  const rows = table.getRowModel().rows;
  return (
    <Table className="**:data-[slot=table-cell]:px-(--card-spacing) **:data-[slot=table-head]:px-(--card-spacing)">
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => (
              <TableHead key={header.id} className="h-11 text-muted-foreground" colSpan={header.colSpan}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && "cursor-pointer")}
              onClick={
                onRowClick
                  ? (event) => {
                      // React bubbles events from portals (menus, dialogs opened from the row)
                      // through the row; only clicks on the row's own cells open it.
                      if (event.currentTarget.contains(event.target as Node)) onRowClick(row.original);
                    }
                  : undefined
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-3">
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
              {empty}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Column title that sorts and hides through a small menu, as in the reference dashboard. */
export function DataTableColumnHeader<TData extends RowData>({
  column,
  title,
  className,
}: {
  column: DataTableColumn<TData>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort() && !column.getCanHide()) {
    return <span className={className}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  const Icon = sorted === "desc" ? ArrowDown : sorted === "asc" ? ArrowUp : ChevronsUpDown;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("-ml-3 font-medium text-muted-foreground data-[state=open]:bg-accent", className)}
        >
          {title}
          <Icon data-icon="inline-end" className={cn(!sorted && "opacity-50")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {column.getCanSort() && (
          <>
            <DropdownMenuItem onSelect={() => column.toggleSorting(false)}>
              <ArrowUp />
              Crescente
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => column.toggleSorting(true)}>
              <ArrowDown />
              Decrescente
            </DropdownMenuItem>
            {sorted && (
              <DropdownMenuItem onSelect={() => column.clearSorting()}>
                <RotateCcw />
                Sem ordem
              </DropdownMenuItem>
            )}
          </>
        )}
        {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
        {column.getCanHide() && (
          <DropdownMenuItem onSelect={() => column.toggleVisibility(false)}>
            <EyeOff />
            Ocultar coluna
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface FacetOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Multi-choice filter over one column (dashed button, count per option), as in the shadcn tasks
 * example. The column must use the `arrIncludesSome` filter and an accessor that returns the
 * option values (a string or an array of strings).
 */
export function DataTableFacetedFilter<TData extends RowData>({
  column,
  title,
  options,
}: {
  column: DataTableColumn<TData> | undefined;
  title: string;
  options: FacetOption[];
}) {
  if (!column) return null;
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const counts = new Map<string, number>();
  for (const row of column.table.getPreFilteredRowModel().rows) {
    const value = row.getValue(column.id) as string | string[] | undefined;
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    column?.setFilterValue(next.size ? [...next] : undefined);
    column?.table.setPageIndex(0);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("border-dashed", selected.size > 0 && "border-solid")}>
          <ListFilter data-icon="inline-start" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              {selected.size > 2 ? (
                <Badge variant="secondary">{selected.size} selecionados</Badge>
              ) : (
                options
                  .filter((option) => selected.has(option.value))
                  .map((option) => (
                    <Badge variant="secondary" key={option.value}>
                      {option.label}
                    </Badge>
                  ))
              )}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.has(option.value)}
              onCheckedChange={() => toggle(option.value)}
              onSelect={(event) => event.preventDefault()}
            >
              {option.icon && <option.icon className="text-muted-foreground" />}
              <span className="flex-1">{option.label}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{counts.get(option.value) ?? 0}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center"
              onSelect={() => {
                column.setFilterValue(undefined);
                column.table.setPageIndex(0);
              }}
            >
              Limpar filtro
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Limpar" button, shown only while some filter is active. */
export function DataTableResetFilters<TData extends RowData>({ table, onReset }: { table: DataTableInstance<TData>; onReset?: () => void }) {
  if (table.state.columnFilters.length === 0) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        table.resetColumnFilters();
        table.setPageIndex(0);
        onReset?.();
      }}
    >
      Limpar
      <X data-icon="inline-end" />
    </Button>
  );
}

/** Column visibility menu ("Colunas"). `labels` names each hideable column. */
export function DataTableViewOptions<TData extends RowData>({
  table,
  labels,
}: {
  table: DataTableInstance<TData>;
  labels: Record<string, string>;
}) {
  const columns = table.getAllLeafColumns().filter((column) => column.id in labels && column.getCanHide());
  const hidden = columns.filter((column) => !column.getIsVisible()).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden lg:flex">
          <Settings2 data-icon="inline-start" />
          Colunas
          {hidden > 0 && <Badge variant="secondary">{hidden} ocultas</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              onSelect={(event) => event.preventDefault()}
            >
              {labels[column.id]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PAGE_SIZES = [10, 20, 30, 50];

/** Footer: how many rows match, rows per page and page navigation. */
export function DataTablePagination<TData extends RowData>({ table, noun }: { table: DataTableInstance<TData>; noun: [string, string] }) {
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getFilteredRowModel().rows.length;
  const all = table.getPreFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const label = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;
  return (
    <div className="flex w-full flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground tabular-nums">
        {total === all ? label(all) : `${label(total)} de ${all}`}
      </div>
      <div className="flex flex-wrap items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Por página</span>
          <Select value={String(pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
            <SelectTrigger size="sm" className="w-18" aria-label="Linhas por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectGroup>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <span className="font-medium tabular-nums">
          Página {Math.min(pageIndex + 1, pageCount)} de {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden lg:flex"
            aria-label="Primeira página"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Página anterior"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próxima página"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden lg:flex"
            aria-label="Última página"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(pageCount - 1)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
