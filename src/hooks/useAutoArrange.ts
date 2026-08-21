import { useReactFlow } from "@xyflow/react";
import { useFTAStore, type FTANode, type FTAEdge } from "@/store/ftaStore";
import { layoutTree } from "@/lib/layout/elkLayout";
import { collectHiddenIds } from "@/lib/analysis/subtree";

/** Re-runs the tree layout and re-fits the view. Called after any
 * structural edit (add/remove/change/collapse) so the canvas never
 * accumulates the scattered positions manual dragging or repeated edits
 * would otherwise leave behind — the tree always snaps back to a clean
 * arrangement. Nodes hidden behind a collapsed gate are excluded from the
 * layout entirely, so siblings pack in tight around the collapsed badge
 * instead of leaving a gap sized for the hidden subtree. */
export function useAutoArrange() {
  const applyLayout = useFTAStore((s) => s.applyLayout);
  const rf = useReactFlow<FTANode, FTAEdge>();

  return async () => {
    const { nodes, edges, collapsedGateIds, compactView } = useFTAStore.getState();
    const hidden = collectHiddenIds(collapsedGateIds, edges);
    const visibleNodes = hidden.size > 0 ? nodes.filter((n) => !hidden.has(n.id)) : nodes;
    const visibleEdges =
      hidden.size > 0 ? edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) : edges;
    const positioned = await layoutTree(visibleNodes, visibleEdges, compactView);
    applyLayout(positioned);
    requestAnimationFrame(() => rf.fitView({ duration: 300, padding: 0.2 }));
  };
}
