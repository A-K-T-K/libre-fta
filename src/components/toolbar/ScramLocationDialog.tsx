import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@fluentui/react-components";
import { useAppActions } from "@/hooks/useAppActions";
import { FolderOpenRegular as FolderOpen, ArrowSyncRegular as Sync } from "@fluentui/react-icons";

export function ScramLocationDialog() {
  const {
    scramLocationDialogOpen,
    setScramLocationDialogOpen,
    scramAvailable,
    scramBinaryPath,
    scramSource,
    selectScramFolder,
    resetScramToAuto,
    scramSearching,
  } = useAppActions();

  return (
    <Dialog open={scramLocationDialogOpen} onOpenChange={setScramLocationDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SCRAM CLI Location</DialogTitle>
          <DialogDescription>
            Point the app at your SCRAM install if it isn't on your system PATH — otherwise analysis falls
            back to the built-in engine, which doesn't support everything the real solver does (CCF groups,
            Monte Carlo uncertainty via SCRAM's own sampler, etc.). You can pick the folder holding the
            binary directly, or a git-cloned SCRAM source checkout — it searches a few levels down for the
            built binary (e.g. under <code className="font-mono">build/bin/</code>) either way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={scramAvailable ? "text-success" : "text-muted-foreground"}>
              {scramAvailable ? "Found" : "Not found"}
            </span>
          </div>
          {scramBinaryPath && (
            <div className="space-y-1">
              <span className="text-muted-foreground">Path</span>
              <div className="break-all font-mono text-[11px]">{scramBinaryPath}</div>
            </div>
          )}
          {scramSource && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source</span>
              <span>
                {scramSource === "manual"
                  ? "Manually selected"
                  : scramSource === "bundled"
                    ? "Bundled with the app"
                    : "Auto-detected (PATH)"}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="shrink-0 gap-1.5 whitespace-nowrap"
            disabled={scramSearching}
            onClick={() => void resetScramToAuto()}
          >
            <Sync className="h-3.5 w-3.5" /> Auto-detect
          </Button>
          <Button
            className="shrink-0 gap-1.5 whitespace-nowrap"
            disabled={scramSearching}
            onClick={() => void selectScramFolder()}
          >
            {scramSearching ? <Spinner size="tiny" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {scramSearching ? "Searching…" : "Browse for Folder…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
