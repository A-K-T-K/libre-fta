import {
  DismissRegular as X,
  BranchRegular as GitBranch,
  GridRegular as LayoutGrid,
  ChartMultipleRegular as BarChart3,
} from "@fluentui/react-icons";
import { useFTAStore } from "@/store/ftaStore";
import { cn } from "@/lib/utils";

const MAIN_TAB_ID = "main";

export function TabBar() {
  const activeTabId = useFTAStore((s) => s.activeTabId);
  const activeTabName = useFTAStore((s) => s.activeTabName);
  const tabs = useFTAStore((s) => s.tabs);
  const switchTab = useFTAStore((s) => s.switchTab);
  const closeTab = useFTAStore((s) => s.closeTab);
  const mainView = useFTAStore((s) => s.mainView);
  const setMainView = useFTAStore((s) => s.setMainView);
  const results = useFTAStore((s) => s.results);

  const allTabs = [{ id: activeTabId, name: activeTabName }, ...tabs.map((t) => ({ id: t.id, name: t.name }))];

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-card px-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.id !== activeTabId && switchTab(tab.id)}
            className={cn(
              "group flex shrink-0 items-center gap-1.5 border-x border-transparent border-t-2 px-3 py-1 text-xs transition-colors",
              tab.id === activeTabId
                ? "border-t-primary bg-background font-medium text-foreground"
                : "border-t-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <GitBranch className={cn("h-3 w-3", tab.id === activeTabId ? "text-primary" : "opacity-60")} />
            <span className="max-w-[140px] truncate">{tab.name}</span>
            {tab.id === activeTabId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            {tab.id !== MAIN_TAB_ID && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="rounded-sm opacity-0 hover:bg-destructive/20 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pl-1">
        <button
          onClick={() => setMainView("diagram")}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors",
            mainView === "diagram" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"
          )}
        >
          <LayoutGrid className="h-3 w-3" /> Diagram
        </button>
        <button
          onClick={() => setMainView("results")}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors",
            mainView === "results" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"
          )}
        >
          <BarChart3 className="h-3 w-3" />
          Results
          {results && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
        </button>
      </div>
    </div>
  );
}
