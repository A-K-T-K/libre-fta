import { useEffect, useState } from "react";
import { useAppActions } from "@/hooks/useAppActions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatScientific } from "@/lib/utils";
import { getTreeSources } from "@/store/ftaStore";
import type { AnalysisResults } from "@/types/fta";
import {
  WarningRegular as AlertTriangle,
  ClockRegular as Clock,
  LayerRegular as Layers,
  ArrowClockwiseRegular as Recalculate,
} from "@fluentui/react-icons";

export function TopEventReadout() {
  const { results, runOptions, setRunOptions, executeRun, isRunning, hasBlockingErrors } = useAppActions();
  const [timeDraft, setTimeDraft] = useState(runOptions.missionTime);

  // The mission time only matters when at least one event's probability is
  // time-dependent (failure rate) — for an all-constant-probability model
  // it's a dead control, so it only shows up once it's actually relevant.
  const hasTimeBasedEvent = (() => {
    const { all } = getTreeSources();
    return all.some((t) => t.nodes.some((n) => n.data.probability?.lambda !== undefined));
  })();

  // Keep the draft in sync with whatever time the *current* result was
  // actually computed at — otherwise running via the toolbar's own dialog
  // (a different mission time) would leave this input stale, showing
  // "Recalculate" as available for a change that already happened.
  useEffect(() => {
    if (results) setTimeDraft(results.missionTime ?? runOptions.missionTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results?.runAt]);

  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Run an analysis to see the top event probability and results.
      </div>
    );
  }

  const shownTime = results.missionTime ?? runOptions.missionTime;
  const isStale = timeDraft !== shownTime;

  const recalculate = () => {
    setRunOptions({ missionTime: timeDraft });
    void executeRun();
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Top Event Probability
        </span>
        <Badge variant="secondary" className="uppercase">
          {results.algorithm}
        </Badge>
      </div>
      <div className="text-3xl font-semibold tabular-nums">
        {formatScientific(results.topEventProbability, 4)}
      </div>
      {results.uncertainty && <UncertaintyReadout uncertainty={results.uncertainty} />}

      {/* Mission time only affects results when a time-dependent
          (failure-rate) event exists somewhere in the model — for an
          all-constant-probability model, changing it would be a no-op, so
          the control only appears once it's actually meaningful. */}
      {hasTimeBasedEvent && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <label htmlFor="mission-time-view" className="text-[11px] text-muted-foreground">
            At mission time
          </label>
          <Input
            id="mission-time-view"
            type="number"
            min={0}
            step="any"
            className="h-7 w-24"
            value={timeDraft}
            onChange={(e) => setTimeDraft(Number(e.target.value))}
          />
          <span className="text-[11px] text-muted-foreground">hrs</span>
          <Button
            size="sm"
            variant={isStale ? "secondary" : "ghost"}
            className="h-7 gap-1 px-2"
            disabled={isRunning || hasBlockingErrors || !isStale}
            onClick={recalculate}
            title={hasBlockingErrors ? "Fix validation errors first" : "Re-run analysis at this mission time"}
          >
            <Recalculate className="h-3.5 w-3.5" />
            Recalculate
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> {results.cutSets.length} minimal cut sets
        </span>
        {results.wallTimeMs !== undefined && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {results.wallTimeMs.toFixed(0)} ms
          </span>
        )}
      </div>
      {results.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2 text-[11px] text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UncertaintyReadout({ uncertainty }: { uncertainty: NonNullable<AnalysisResults["uncertainty"]> }) {
  const { mean, stdDev, ci } = uncertainty;
  const [lo, hi] = ci;
  const span = hi - lo || 1;
  const meanPct = Math.min(100, Math.max(0, ((mean - lo) / span) * 100));

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Uncertainty (Monte Carlo)</span>
        <span>90% CI</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span>{formatScientific(lo, 3)}</span>
        <span className="text-sm font-semibold">{formatScientific(mean, 3)}</span>
        <span>{formatScientific(hi, 3)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-border">
        <div className="absolute inset-0 rounded-full bg-primary/30" />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
          style={{ left: `${meanPct}%` }}
          title={`Mean: ${formatScientific(mean, 4)}`}
        />
      </div>
      <div className="text-right text-[10px] text-muted-foreground">
        σ <span className="tabular-nums">{formatScientific(stdDev, 3)}</span>
      </div>
    </div>
  );
}
