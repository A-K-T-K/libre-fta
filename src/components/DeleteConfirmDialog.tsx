import { useFTAStore } from "@/store/ftaStore";
import { useAutoArrange } from "@/hooks/useAutoArrange";
import { collectDescendants } from "@/lib/analysis/subtree";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteConfirmDialog() {
  const pendingDelete = useFTAStore((s) => s.pendingDelete);
  const setPendingDelete = useFTAStore((s) => s.setPendingDelete);
  const autoArrange = useAutoArrange();

  return (
    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      title="Delete this and everything beneath it?"
      description={
        pendingDelete
          ? `"${pendingDelete.label}" has ${pendingDelete.descendantCount} node${pendingDelete.descendantCount === 1 ? "" : "s"} beneath it in the tree. Deleting it removes that whole subtree, not just this one node.`
          : ""
      }
      confirmLabel="Delete Subtree"
      destructive
      onConfirm={() => {
        if (!pendingDelete) return;
        const { edges, removeNodes } = useFTAStore.getState();
        const targetSet = new Set(pendingDelete.ids);
        const descendants = new Set<string>();
        for (const id of pendingDelete.ids) {
          for (const d of collectDescendants(id, edges)) {
            if (!targetSet.has(d)) descendants.add(d);
          }
        }
        removeNodes([...pendingDelete.ids, ...descendants]);
        void autoArrange();
      }}
    />
  );
}
