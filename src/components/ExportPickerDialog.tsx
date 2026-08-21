import { ImageRegular as ImageIcon, DocumentPdfRegular as PdfIcon } from "@fluentui/react-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFTAStore } from "@/store/ftaStore";
import { useAppActions } from "@/hooks/useAppActions";

/** Ctrl+E's "quick export" picker — diagram-as-image and report-as-PDF are
 * the formats most people reach for repeatedly while iterating on a tree
 * (unlike the Open-PSA MEF/full-JSON saves, which already have their own
 * dedicated shortcuts — Ctrl+S/Ctrl+Shift+S — since those represent "the
 * document", not a one-off export), so they're grouped behind one shortcut
 * instead of requiring the File menu each time. */
export function ExportPickerDialog() {
  const open = useFTAStore((s) => s.exportPickerOpen);
  const setOpen = useFTAStore((s) => s.setExportPickerOpen);
  const a = useAppActions();

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Export the current diagram or analysis report.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" className="justify-start" onClick={() => run(a.exportDiagramPng)}>
            <ImageIcon className="h-3.5 w-3.5" /> Export Diagram as PNG…
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => run(a.exportDiagramSvg)}>
            <ImageIcon className="h-3.5 w-3.5" /> Export Diagram as SVG…
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={!a.results}
            title={a.results ? undefined : "Run an analysis first"}
            onClick={() => run(a.exportReportPdf)}
          >
            <PdfIcon className="h-3.5 w-3.5" /> Export Report as PDF…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
