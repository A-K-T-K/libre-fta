import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@fluentui/react-components";

interface SaveDiscardCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Label for the destructive middle button — "Don't Save" when closing
   * the app, "Start New Model" when discarding into a fresh model, etc.
   * Whatever it's labeled, it always means "proceed without saving". */
  discardLabel: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/** Generic three-way "Save / Discard / Cancel" prompt — the same shape
 * every conventional desktop editor uses whenever an action would lose
 * unsaved work (closing the app, starting a new document, …), reused
 * here for both rather than each rolling its own. Cancel just closes the
 * dialog (`onOpenChange(false)`) and does nothing else; Save exports the
 * current document first (the caller decides what happens after — see
 * `CloseGuard`/`MenuBar`'s own `onSave` handlers, which only proceed with
 * the underlying action once the save actually succeeds); Discard closes
 * the dialog and proceeds immediately without saving — closing it here
 * rather than leaving that to each `onDiscard` is what makes it correct
 * even for `CloseGuard`'s "Don't Save" (which destroys the whole window
 * right after, so it wouldn't otherwise matter) and `MenuBar`'s "Start
 * New Model" (which doesn't touch dialog state at all, so without this
 * the dialog would stay open behind the freshly-reset model). */
export function SaveDiscardCancelDialog({
  open,
  onOpenChange,
  title,
  description,
  discardLabel,
  saving,
  onSave,
  onDiscard,
}: SaveDiscardCancelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onDiscard();
            }}
            disabled={saving}
          >
            {discardLabel}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Spinner size="tiny" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
