"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  cell: (row: T) => React.ReactNode;
}

export interface FilterDef {
  key: string; // = URL-Query-Key
  label: string;
  options: { label: string; value: string }[];
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string | null;
  dir: "asc" | "desc";
  search: string;
  filters?: FilterDef[];
  activeFilters?: Record<string, string>;
  searchPlaceholder?: string;
  rowKey: (row: T) => string;
  exportPath?: string;
}

const ALL = "__all__";

export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  pageSize,
  totalPages,
  sort,
  dir,
  search,
  filters = [],
  activeFilters = {},
  searchPlaceholder = "Suchen…",
  rowKey,
  exportPath,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [term, setTerm] = React.useState(search);

  const setQuery = React.useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.set("page", "1");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounced Suche
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (term !== search) setQuery({ q: term || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function toggleSort(key: string) {
    if (sort !== key) setQuery({ sort: key, dir: "asc" });
    else if (dir === "asc") setQuery({ sort: key, dir: "desc" });
    else setQuery({ sort: null, dir: null });
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {/* Toolbar: Suche + Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {filters.map((f) => (
          <Select
            key={f.key}
            value={activeFilters[f.key] ?? ALL}
            onValueChange={(v) => setQuery({ [f.key]: v === ALL ? null : v })}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{f.label}: Alle</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {exportPath && (
          <a
            href={`${exportPath}?${params.toString()}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent sm:ml-auto"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        )}
      </div>

      {/* Tabelle */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.sortable ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.header}
                      {sort === c.key ? (
                        dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Keine Einträge gefunden.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(c.className)}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {from}–{to} von {total}
        </p>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => setQuery({ pageSize: v })}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} / Seite</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setQuery({ page: String(page - 1) }, false)}
          >
            Zurück
          </Button>
          <span className="text-sm text-muted-foreground">
            Seite {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setQuery({ page: String(page + 1) }, false)}
          >
            Weiter
          </Button>
        </div>
      </div>
    </div>
  );
}
