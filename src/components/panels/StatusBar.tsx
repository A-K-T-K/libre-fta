import { useViewport } from "@xyflow/react";
import {
  ErrorCircleRegular as AlertCircle,
  WarningRegular as AlertTriangle,
  CheckmarkCircleRegular as CheckCircle2,
  BranchRegular as GitBranch,
  FlowchartRegular as Workflow,
  FlashRegular as Zap,
  FlashOffRegular as ZapOff,
  DataUsageRegular as MemoryIcon,
} from "@fluentui/react-icons";
import { useFTAStore } from "@/store/ftaStore";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const nodes = useFTAStore((s) => s.nodes);
  const edges = useFTAStore((s) => s.edges);
  const lintIssues = useFTAStore((s) => s.lintIssues);
  const scramAvailable = useFTAStore((s) => s.scramAvailable);
  const setScramLocationDialogOpen = useFTAStore((s) => s.setScramLocationDialogOpen);
  const results = useFTAStore((s) => s.results);
  const memoryUsageBytes = useFTAStore((s) => s.memoryUsageBytes);
  const { zoom } = useViewport();

  const errorCount = lintIssues.filter((i) => i.severity === "error").length;
  const warningCount = lintIssues.filter((i) => i.severity === "warning").length;

  return (
    <div className="flex h-5 shrink-0 items-center gap-3 border-t border-border bg-card px-2.5 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Workflow className="h-3 w-3" /> {nodes.length} nodes
      </span>
      <span className="flex items-center gap-1">
        <GitBranch className="h-3 w-3" /> {edges.length} edges
      </span>

      <div className="h-3 w-px bg-border" />

      {lintIssues.length === 0 ? (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" /> Valid
        </span>
      ) : (
        <>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" /> {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" /> {warningCount}
            </span>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {results?.topEventProbability !== undefined && (
          <span className="tabular-nums">
            P(TOP) = {results.topEventProbability.toExponential(3)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setScramLocationDialogOpen(true)}
          title="Click to set the SCRAM CLI location"
          className={cn("flex cursor-pointer items-center gap-1", scramAvailable ? "text-success" : undefined)}
        >
          {scramAvailable ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
          {scramAvailable ? "SCRAM CLI" : "Built-in engine"}
        </button>
        {memoryUsageBytes !== null && (
          <span className="flex items-center gap-1 tabular-nums" title="App process memory (RSS)">
            <MemoryIcon className="h-3 w-3" /> {(memoryUsageBytes / 1024 / 1024).toFixed(0)} MB
          </span>
        )}
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
