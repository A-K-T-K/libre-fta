import { WarningRegular as Warning } from "@fluentui/react-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFTAStore } from "@/store/ftaStore";

/** Shown instead of a generic failure toast whenever an analysis run is
 * refused for exceeding a memory-safety limit — either the built-in
 * engine's own cut-set-explosion cap, or a SCRAM CLI report too large to
 * safely read into the webview's JS heap (see `resourceLimitError.ts` /
 * `runner.ts`). Gives the user something to actually act on (node count,
 * which limit was hit) instead of "analysis failed". */
export function ResourceLimitDialog() {
  const error = useFTAStore((s) => s.resourceLimitError);
  const setResourceLimitError = useFTAStore((s) => s.setResourceLimitError);
  const setRunDialogOpen = useFTAStore((s) => s.setRunDialogOpen);

  return (
    <Dialog open={error !== null} onOpenChange={(open) => !open && setResourceLimitError(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Warning className="h-4 w-4 text-destructive" />
              Analysis stopped — too large to run safely
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>{error?.message}</p>
          <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs leading-relaxed">
            <div className="mb-1 font-semibold text-muted-foreground">Details</div>
            {/* Fixed "en-US" grouping, not the system locale — a technical
                figure like this should read the same everywhere rather than
                risk e.g. South Asian "4,00,000"-style grouping looking like
                a typo. */}
            <div>Model: {error?.nodeCount.toLocaleString("en-US")} nodes</div>
            <div className="mt-1 whitespace-pre-wrap">{error?.detail}</div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The run was stopped before it could exhaust memory — nothing crashed, and your model is unchanged. Try
            raising the cut-off or lowering the limit-order in Run Options, or simplifying the tree.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setResourceLimitError(null);
              setRunDialogOpen(true);
            }}
          >
            Open Run Options
          </Button>
          <Button onClick={() => setResourceLimitError(null)}>Dismiss</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
