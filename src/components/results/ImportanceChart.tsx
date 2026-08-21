import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { useFTAStore } from "@/store/ftaStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatScientific } from "@/lib/utils";
import type { ImportanceRow } from "@/types/fta";

type Measure = "birnbaum" | "criticality" | "fusselVesely" | "raw" | "rrw";
type ViewMode = "plot" | "value";

const MEASURE_LABEL: Record<Measure, string> = {
  birnbaum: "Birnbaum (Marginal Importance)",
  criticality: "Criticality Importance",
  fusselVesely: "Fussell-Vesely",
  raw: "Risk Achievement Worth",
  rrw: "Risk Reduction Worth",
};

const CHART_COLORS = [
  "oklch(0.62 0.17 255)",
  "oklch(0.68 0.15 195)",
  "oklch(0.72 0.16 145)",
  "oklch(0.75 0.15 85)",
  "oklch(0.68 0.19 25)",
  "oklch(0.65 0.16 320)",
];

export function ImportanceChart() {
  const results = useFTAStore((s) => s.results);
  const [measure, setMeasure] = useState<Measure>("birnbaum");
  const [view, setView] = useState<ViewMode>("value");

  const data = useMemo(() => {
    const rows: ImportanceRow[] = results?.importance ?? [];
    return [...rows]
      .sort((a, b) => (b[measure] ?? 0) - (a[measure] ?? 0))
      .slice(0, 12)
      .map((r) => ({ name: r.identifier, value: r[measure] ?? 0 }));
  }, [results, measure]);

  if (!results || results.importance.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        No importance data available yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select value={measure} onValueChange={(v) => setMeasure(v as Measure)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MEASURE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex shrink-0 gap-1 rounded-md border border-border p-0.5">
          <Button
            size="sm"
            variant={view === "plot" ? "secondary" : "ghost"}
            className="h-7 px-2.5"
            onClick={() => setView("plot")}
          >
            Plot
          </Button>
          <Button
            size="sm"
            variant={view === "value" ? "secondary" : "ghost"}
            className="h-7 px-2.5"
            onClick={() => setView("value")}
          >
            Values
          </Button>
        </div>
      </div>

      {view === "plot" ? (
        <div className="min-h-[260px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={70}
                tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                // `contentStyle` only themes the outer box — recharts renders
                // the label/value text with its own separate styles that
                // otherwise default to plain black, unreadable on a dark
                // background even though the box around it looked fine.
                labelStyle={{ color: "var(--popover-foreground)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
                cursor={{ fill: "var(--accent)" }}
                formatter={(v) => Number(v).toExponential(3)}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow style={{ display: "flex" }}>
                <TableHead style={{ flex: "1 1 auto" }}>Event</TableHead>
                <TableHead style={{ width: 140, flex: "0 0 auto" }}>{MEASURE_LABEL[measure]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.name} style={{ display: "flex" }}>
                  <TableCell style={{ flex: "1 1 auto" }} className="font-mono text-xs">
                    {row.name}
                  </TableCell>
                  <TableCell style={{ width: 140, flex: "0 0 auto" }} className="text-xs tabular-nums">
                    {formatScientific(row.value, 3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
