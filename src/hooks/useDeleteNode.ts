import { useFTAStore } from "@/store/ftaStore";
import { useAutoArrange } from "@/hooks/useAutoArrange";
import { collectDescendants } from "@/lib/analysis/subtree";

/** Deletes one or more nodes, cascading to every descendant so a gate or
 * event-box's subtree is never silently orphaned on the canvas — a leaf
 * event (no descendants) is removed immediately with no friction, but
 * anything with children goes through a confirmation first (`pendingDelete`
 * in the store, answered by `DeleteConfirmDialog` in App.tsx) since it's a
 * much bigger, easy-to-trigger-by-accident action. */
export function useDeleteNode() {
  const autoArrange = useAutoArrange();

  return (ids: string[]) => {
    const { edges, nodes, removeNodes, setPendingDelete } = useFTAStore.getState();
    // TOP can't be deleted (there's always exactly one, and every other
    // context menu already hides its own Delete item for it).
    const targetIds = ids.filter((id) => nodes.find((n) => n.id === id)?.data.category !== "top");
    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const descendants = new Set<string>();
    for (const id of targetIds) {
      for (const d of collectDescendants(id, edges)) {
        if (!targetSet.has(d)) descendants.add(d);
      }
    }

    if (descendants.size === 0) {
      removeNodes(targetIds);
      void autoArrange();
      return;
    }

    const label = targetIds
      .map((id) => nodes.find((n) => n.id === id)?.data.label ?? id)
      .join(", ");
    setPendingDelete({ ids: targetIds, label, descendantCount: descendants.size });
  };
}
