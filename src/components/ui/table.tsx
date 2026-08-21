import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Deliberately not built on Fluent's `Table` primitives: Fluent draws row
 * borders as an internal `box-shadow` on each cell (not a plain
 * `border-bottom`), which — combined with a sticky, opaque header sitting on
 * top during scroll — produced visibly doubled/overlapping hairlines that
 * couldn't be fixed by styling around it (we don't control that CSS). These
 * are plain flex-row divs with exactly one border declaration per seam
 * (`TableRow`'s own `border-bottom`), so there's only ever one line to draw.
 */

const Table = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="table" className={cn("flex w-full flex-col text-sm", className)} {...props} />
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="rowgroup"
      className={cn("sticky top-0 z-10 flex flex-col bg-card", className)}
      {...props}
    />
  )
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="rowgroup" className={cn("flex flex-col", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="row" className={cn("flex items-center border-b border-border", className)} {...props} />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLDivElement, React.ThHTMLAttributes<HTMLDivElement>>(
  ({ className, colSpan: _colSpan, ...props }, ref) => (
    <div
      ref={ref}
      role="columnheader"
      className={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLDivElement, React.TdHTMLAttributes<HTMLDivElement>>(
  ({ className, colSpan: _colSpan, ...props }, ref) => (
    <div ref={ref} role="cell" className={cn("px-3 py-2", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
