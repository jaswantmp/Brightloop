// Reusable data table: search, parent-driven filters, client-side pagination,
// loading skeletons, empty state, row click. Rows are already scoped by the backend.
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui-bits";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  render?: (row: T) => ReactNode;
  searchValue?: (row: T) => string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  rowTestId?: (row: T, index: number) => string;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  pageSize?: number;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowTestId,
  searchPlaceholder = "Search…",
  toolbar,
  pageSize = 10,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  emptyAction,
  onRowClick,
}: DataTableProps<T>) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((c) => {
        const value = c.searchValue ? c.searchValue(row) : null;
        return value ? value.toLowerCase().includes(needle) : false;
      })
    );
  }, [rows, q, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className="h-9 max-w-xs bg-white"
          data-testid="table-search"
        />
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {loading ? (
        <div className="space-y-2 p-4" data-testid="table-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} testid="table-empty" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={rowTestId ? rowTestId(row, i) : i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  data-testid={rowTestId ? rowTestId(row, i) : undefined}
                  className={`border-b border-slate-100 text-slate-800 last:border-0 ${
                    onRowClick ? "cursor-pointer hover:bg-slate-50/80" : "hover:bg-slate-50/80"
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 ${c.align === "right" ? "text-right" : "text-left"} ${c.className ?? ""}`}
                    >
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        <span data-testid="table-count">
          {filtered.length} record{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            data-testid="table-prev"
          >
            Prev
          </Button>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            data-testid="table-next"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
