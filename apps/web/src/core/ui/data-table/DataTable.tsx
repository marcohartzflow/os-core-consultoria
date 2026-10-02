"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
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
import { PAGE_SIZES, type DataTableColumn, type DataTableInstance } from "./features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  loading = false,
}: {
  table: DataTableInstance<TData>;
  empty: ReactNode;
  /** A new page is on its way: the current rows stay, dimmed, instead of flashing a skeleton. */
  loading?: boolean;
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
      <TableBody aria-busy={loading} className={cn("transition-opacity", loading && "opacity-60")}>
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
  // Only sortable columns get the menu; hiding any column stays in the "Colunas" menu.
  if (!column.getCanSort()) {
    return <span className={cn("font-medium", className)}>{title}</span>;
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
 * Multi-choice filter over one column (dashed button, as in the shadcn tasks example). Tables
 * filtered in the browser show how many rows each option has; tables filtered by the API do not
 * (the current page is not the whole set). Long lists get a search box.
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
  if (!column.table.options.manualFiltering) {
    for (const row of column.table.getPreFilteredRowModel().rows) {
      const value = row.getValue(column.id) as string | string[] | undefined;
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
  }

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    column?.setFilterValue(next.size ? [...next] : undefined);
    // Tables paged by the API go back to page 1 on any filter change by themselves; a second
    // update here would be built from the same (old) URL and undo the filter.
    if (!column?.table.options.manualFiltering) column?.table.setPageIndex(0);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
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
                    <Badge variant="secondary" key={option.value} className="max-w-32 truncate">
                      {option.label}
                    </Badge>
                  ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          {options.length > 7 && <CommandInput placeholder={`Buscar ${title.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>Nenhuma opção.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border border-input",
                        isSelected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                    {option.icon && <option.icon className="text-muted-foreground" />}
                    <span className="flex-1 truncate">{option.label}</span>
                    {counts.size > 0 && (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{counts.get(option.value) ?? 0}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="justify-center"
                    onSelect={() => {
                      column.setFilterValue(undefined);
                      if (!column.table.options.manualFiltering) column.table.setPageIndex(0);
                    }}
                  >
                    Limpar filtro
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** "Limpar" button, shown only while a search or filter is active. */
export function DataTableResetFilters({ visible, onReset }: { visible: boolean; onReset: () => void }) {
  if (!visible) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onReset}>
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

/** Footer: how many rows match, rows per page and page navigation. */
export function DataTablePagination<TData extends RowData>({ table, noun }: { table: DataTableInstance<TData>; noun: [string, string] }) {
  const { pageIndex, pageSize } = table.state.pagination;
  // Tables paged by the API know only the total of the current search.
  const manual = Boolean(table.options.manualPagination);
  const total = manual ? (table.options.rowCount ?? 0) : table.getFilteredRowModel().rows.length;
  const all = manual ? total : table.getPreFilteredRowModel().rows.length;
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

/**
 * Footer of a table paged by position (useServerTable with `cursor`): the total, exact or "at
 * least", rows per page, and newest / newer / older / oldest instead of page numbers.
 */
export function DataTableCursorPagination({
  cursor,
  noun,
}: {
  cursor: {
    total: number;
    totalExact: boolean;
    atNewest: boolean;
    atOldest: boolean;
    newest: () => void;
    newer: () => void;
    older: () => void;
    oldest: () => void;
    pageSize: number;
    setPageSize: (size: number) => void;
  };
  noun: [string, string];
}) {
  const count = cursor.total.toLocaleString("pt-BR");
  return (
    <div className="flex w-full flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground tabular-nums">
        {cursor.totalExact
          ? `${count} ${cursor.total === 1 ? noun[0] : noun[1]}`
          : `Mais de ${count} ${noun[1]}`}
      </div>
      <div className="flex flex-wrap items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Por página</span>
          <Select value={String(cursor.pageSize)} onValueChange={(value) => cursor.setPageSize(Number(value))}>
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
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden lg:flex"
            aria-label="Página mais recente"
            disabled={cursor.atNewest}
            onClick={cursor.newest}
          >
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Página anterior (mais recentes)" disabled={cursor.atNewest} onClick={cursor.newer}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Próxima página (mais antigos)" disabled={cursor.atOldest} onClick={cursor.older}>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden lg:flex"
            aria-label="Página mais antiga"
            disabled={cursor.atOldest}
            onClick={cursor.oldest}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
