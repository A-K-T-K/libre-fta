import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useFTAStore, getTreeSources } from "@/store/ftaStore";
import { buildCombinedTree } from "@/lib/analysis/combineTree";
import { sweepEventProbability, leafProbabilityAt } from "@/lib/analysis/engine";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatScientific } from "@/lib/utils";

const STEPS = 25;

export function SensitivityChart() {
  const nodes = useFTAStore((s) => s.nodes);
  const missionTime = useFTAStore((s) => s.runOptions.missionTime);

  const sweepable = nodes.filter(
    (n) => n.data.category === "event" && n.data.eventKind !== "house" && n.data.eventKind !== "intermediate"
  );

  const [eventId, setEventId] = useState<string | undefined>(sweepable[0]?.id);
  const selected = sweepable.find((n) => n.id === eventId) ?? sweepable[0];
  const baseline = selected ? leafProbabilityAt(selected.data.probability, missionTime) : 0;

  const [minStr, setMinStr] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [points, setPoints] = useState<{ value: number; topEventProbability: number }[] | null>(null);

  const defaultMin = Math.max(1e-9, baseline * 0.1 || 1e-5);
  const defaultMax = Math.min(1, baseline * 10 || 1e-1);
  const effectiveMin = minStr !== "" ? Number(minStr) : defaultMin;
  const effectiveMax = maxStr !== "" ? Number(maxStr) : defaultMax;

  const handleSweep = () => {
    if (!selected) return;
    const { main, all } = getTreeSources();
    const combined = buildCombinedTree(main, all);
    const top = combined.nodes.find((n) => n.data.category === "top");
    if (!top) return;
    setPoints(
      sweepEventProbability(
        combined.nodes,
        combined.edges,
        top.id,
        selected.id,
        { min: effectiveMin, max: effectiveMax, steps: STEPS },
        missionTime
      )
    );
  };

  if (sweepable.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        No basic events to sweep in this model.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="max-w-md space-y-1.5">
          <Label>Event</Label>
          <Select
            value={selected?.id}
            onValueChange={(v) => {
              setEventId(v);
              setPoints(null);
              setMinStr("");
              setMaxStr("");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sweepable.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.data.label} ({n.data.identifier})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36 space-y-1.5">
            <Label>Min</Label>
            <Input
              className="w-full min-w-0"
              type="number"
              step="any"
              placeholder={formatScientific(defaultMin, 2)}
              value={minStr}
              onChange={(e) => setMinStr(e.target.value)}
            />
          </div>
          <div className="w-36 space-y-1.5">
            <Label>Max</Label>
            <Input
              className="w-full min-w-0"
              type="number"
              step="any"
              placeholder={formatScientific(defaultMax, 2)}
              value={maxStr}
              onChange={(e) => setMaxStr(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleSweep} disabled={!selected}>
            Sweep
          </Button>
        </div>
      </div>

      {!points ? (
        <div className="flex h-40 flex-1 items-center justify-center text-xs text-muted-foreground">
          Choose a range and click Sweep to see how the top-event probability responds.
        </div>
      ) : (
        <div className="min-h-[260px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="value"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => formatScientific(v, 1)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                tickFormatter={(v: number) => formatScientific(v, 1)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
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
                labelStyle={{ color: "var(--popover-foreground)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
                cursor={{ stroke: "var(--accent)" }}
                formatter={(v) => Number(v).toExponential(3)}
                labelFormatter={(v) => `Event value: ${Number(v).toExponential(3)}`}
              />
              <Line type="monotone" dataKey="topEventProbability" stroke="oklch(0.62 0.17 255)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
