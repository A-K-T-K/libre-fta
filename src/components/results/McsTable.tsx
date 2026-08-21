import { useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowSortRegular as ArrowUpDown, SearchRegular as Search } from "@fluentui/react-icons";
import { useFTAStore } from "@/store/ftaStore";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatPercent, formatScientific } from "@/lib/utils";
import type { MinimalCutSet } from "@/types/fta";

const ROW_HEIGHT = 37;

export function McsTable() {
  const results = useFTAStore((s) => s.results);
  const nodes = useFTAStore((s) => s.nodes);
  const [sorting, setSorting] = useState<SortingState>([{ id: "probability", desc: true }]);
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const idToIdentifier = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.identifier])), [nodes]);

  const columns = useMemo<ColumnDef<MinimalCutSet>[]>(
    () => [
      {
        accessorKey: "order",
        header: "Order",
        size: 60,
        cell: (c) => <span className="text-xs tabular-nums">{c.getValue<number>()}</span>,
      },
      {
        id: "events",
        header: "Cut Set",
        cell: (c) => (
          <div className="flex flex-wrap gap-1">
            {c.row.original.events.map((id) => (
              <Badge key={id} variant="outline" className="font-mono text-[10px]">
                {idToIdentifier.get(id) ?? id}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "probability",
        header: "Probability",
        size: 120,
        cell: (c) => (
          <span className="text-xs tabular-nums">{formatScientific(c.getValue<number>(), 3)}</span>
        ),
      },
      {
        accessorKey: "contribution",
        header: "Contribution",
        size: 110,
        cell: (c) => (
          <span className="text-xs tabular-nums">{formatPercent(c.getValue<number>(), 1)}</span>
        ),
      },
    ],
    [idToIdentifier]
  );

  const data = results?.cutSets ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter((c) =>
      c.events.some((id) => (idToIdentifier.get(id) ?? id).toLowerCase().includes(q))
    );
  }, [data, filter, idToIdentifier]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  // Cut-set lists for real fault trees can run into the thousands — only
  // the rows actually scrolled into view get rendered, so this table's
  // cost stays flat regardless of how many results the solver returns.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (!results) return null;

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by event identifier…"
          className="pl-8"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} style={{ display: "flex" }}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width: header.column.getSize(),
                      flex: header.column.id === "events" ? "1 1 auto" : "0 0 auto",
                    }}
                  >
                    <button
                      className="flex items-center gap-1 select-none"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {rows.length > 0 && (
            <TableBody style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
              {virtualItems.map((vi) => {
                const row = rows[vi.index];
                return (
                  <TableRow
                    key={row.id}
                    style={{
                      display: "flex",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          flex: cell.column.id === "events" ? "1 1 auto" : "0 0 auto",
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </Table>
        {filtered.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No cut sets match your filter.</div>
        )}
      </div>
    </div>
  );
}
