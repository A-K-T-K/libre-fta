import {
  ErrorCircleRegular as AlertCircle,
  WarningRegular as AlertTriangle,
  CheckmarkCircleRegular as CheckCircle2,
} from "@fluentui/react-icons";
import { useFTAStore } from "@/store/ftaStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LintIssue } from "@/types/fta";

export function LintPanel() {
  const lintIssues = useFTAStore((s) => s.lintIssues);
  const setSelected = useFTAStore((s) => s.setSelected);
  const switchTab = useFTAStore((s) => s.switchTab);
  const activeTabId = useFTAStore((s) => s.activeTabId);
  const tabs = useFTAStore((s) => s.tabs);

  const errors = lintIssues.filter((i) => i.severity === "error");
  const warnings = lintIssues.filter((i) => i.severity === "warning");

  const tabName = (tabId?: string) => {
    if (!tabId) return undefined;
    if (tabId === activeTabId) return undefined; // no need to call out the tab you're already on
    return tabs.find((t) => t.id === tabId)?.name ?? tabId;
  };

  const goTo = (issue: LintIssue) => {
    if (!issue.nodeId) return;
    if (issue.tabId && issue.tabId !== activeTabId) switchTab(issue.tabId);
    setSelected([issue.nodeId]);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-3">
        {lintIssues.length === 0 && (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-2.5 text-xs text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Model is valid — no issues found across the main tree or any transfer tree.
          </div>
        )}
        {errors.length > 0 && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
            {errors.length} Error{errors.length !== 1 ? "s" : ""}
          </div>
        )}
        {errors.map((issue) => (
          <button
            key={issue.id}
            onClick={() => goTo(issue)}
            className={cn(
              "flex w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/20",
              !issue.nodeId && "cursor-default"
            )}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {issue.message}
              {tabName(issue.tabId) && (
                <span className="ml-1 font-semibold opacity-75">— in "{tabName(issue.tabId)}"</span>
              )}
            </span>
          </button>
        ))}
        {warnings.length > 0 && (
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-warning">
            {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
          </div>
        )}
        {warnings.map((issue) => (
          <button
            key={issue.id}
            onClick={() => goTo(issue)}
            className={cn(
              "flex w-full items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-left text-xs text-warning-foreground transition-colors hover:bg-warning/20",
              !issue.nodeId && "cursor-default"
            )}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {issue.message}
              {tabName(issue.tabId) && (
                <span className="ml-1 font-semibold opacity-75">— in "{tabName(issue.tabId)}"</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
