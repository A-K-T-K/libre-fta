import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  ChevronRightRegular as ChevronRight,
  ChevronDownRegular as ChevronDown,
  SearchRegular as Search,
  DismissRegular as X,
} from "@fluentui/react-icons";
import { useFTAStore, type FTANode, type FTAEdge } from "@/store/ftaStore";
import { EventKindIcon } from "@/components/canvas/nodes/EventKindIcon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { GATE_LABELS } from "@/lib/gateTypes";

function isBoxEvent(n: FTANode) {
  return n.data.category === "top" || n.data.eventKind === "intermediate";
}

interface Row {
  node: FTANode;
  depth: number;
}

function flatten(nodes: FTANode[], edges: FTAEdge[], collapsed: Set<string>): Row[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }

  const top = nodes.find((n) => n.data.category === "top");
  if (!top) return [];

  const rows: Row[] = [];
  const visited = new Set<string>();

  function visit(id: string, depth: number) {
    if (visited.has(id)) return; // guard against accidental cycles
    visited.add(id);
    const node = byId.get(id);
    if (!node) return;
    rows.push({ node, depth });
    if (collapsed.has(id)) return;
    for (const childId of childrenOf.get(id) ?? []) visit(childId, depth + 1);
  }

  visit(top.id, 0);
  return rows;
}

function rowLabel(node: FTANode): string {
  if (node.data.category === "gate") return GATE_LABELS[node.data.gateType ?? "or"] ?? "GATE";
  return node.data.label || node.data.identifier;
}

function RowIcon({ node }: { node: FTANode }) {
  if (node.data.category === "gate") {
    return <span className="text-[9px] font-bold text-muted-foreground">{GATE_LABELS[node.data.gateType ?? "or"]?.[0]}</span>;
  }
  if (isBoxEvent(node)) {
    return <span className="h-2 w-2 rounded-sm border-2" style={{ borderColor: "var(--gate-stroke)" }} />;
  }
  return <EventKindIcon kind={node.data.eventKind ?? "basic"} className="h-3.5 w-3.5" />;
}

export function TreeView() {
  const nodes = useFTAStore((s) => s.nodes);
  const edges = useFTAStore((s) => s.edges);
  const selectedIds = useFTAStore((s) => s.selectedIds);
  const selectOnly = useFTAStore((s) => s.selectOnly);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const rf = useReactFlow<FTANode, FTAEdge>();

  const childrenOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      if (!map.has(e.target)) map.set(e.target, []);
      map.get(e.target)!.push(e.source);
    }
    return map;
  }, [edges]);

  const rows = useMemo(() => flatten(nodes, edges, collapsed), [nodes, edges, collapsed]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return nodes
      .filter((n) => n.data.label.toLowerCase().includes(q) || n.data.identifier.toLowerCase().includes(q))
      .map((node) => ({ node, depth: 0 }));
  }, [nodes, query]);

  const visibleRows = searchResults ?? rows;

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusNode = (node: FTANode) => {
    selectOnly([node.id]);
    rf.setCenter(node.position.x + 40, node.position.y + 40, { zoom: 1, duration: 350 });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative shrink-0 border-b border-border p-1.5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          className="h-6 w-full rounded-sm border border-border bg-background pl-6 pr-6 text-xs outline-none focus:border-ring"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {visibleRows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">
          {searchResults ? "No matching nodes." : "No top event found."}
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="space-y-0.5 p-2">
            {visibleRows.map(({ node, depth }) => {
              const hasChildren = !searchResults && (childrenOf.get(node.id) ?? []).length > 0;
              const isOpen = !collapsed.has(node.id);
              const isSelected = selectedIds.includes(node.id);
              return (
                <button
                  key={node.id}
                  onClick={() => focusNode(node)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left text-xs transition-colors hover:bg-accent",
                    isSelected && "bg-accent"
                  )}
                  style={{ paddingLeft: 6 + depth * 16 }}
                >
                  {hasChildren ? (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(node.id);
                      }}
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <RowIcon node={node} />
                  </span>
                  <span className="truncate">{rowLabel(node)}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {node.data.identifier}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
