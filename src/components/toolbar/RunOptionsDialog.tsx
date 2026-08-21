import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useFTAStore, getTreeSources } from "@/store/ftaStore";
import type { RunOptions, SolverAlgorithm } from "@/types/fta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: () => void;
}

export function RunOptionsDialog({ open, onOpenChange, onRun }: Props) {
  const runOptions = useFTAStore((s) => s.runOptions);
  const setRunOptions = useFTAStore((s) => s.setRunOptions);
  const [local, setLocal] = useState<RunOptions>(runOptions);

  // Mission time only matters once at least one event's probability is
  // time-dependent (failure rate) — otherwise it's a dead field, same
  // gating as the Results tab's own mission-time control.
  const hasTimeBasedEvent = (() => {
    const { all } = getTreeSources();
    return all.some((t) => t.nodes.some((n) => n.data.probability?.lambda !== undefined));
  })();

  const patch = (p: Partial<RunOptions>) => setLocal((prev) => ({ ...prev, ...p }));

  const apply = () => {
    setRunOptions(local);
    onOpenChange(false);
    onRun();
  };

  const handleOpenChange = (o: boolean) => {
    if (o) setLocal(runOptions);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Analysis</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Solver Algorithm</Label>
            <Select value={local.algorithm} onValueChange={(v) => patch({ algorithm: v as SolverAlgorithm })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bdd">BDD (Binary Decision Diagram)</SelectItem>
                <SelectItem value="zbdd">ZBDD (Zero-suppressed BDD)</SelectItem>
                <SelectItem value="mocus">MOCUS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToggleRow label="Probability" checked={local.probability} onChange={(c) => patch({ probability: c })} />
            <ToggleRow label="Importance" checked={local.importance} onChange={(c) => patch({ importance: c })} />
            <ToggleRow label="Uncertainty (Monte Carlo)" checked={local.uncertainty} onChange={(c) => patch({ uncertainty: c })} />
            <ToggleRow
              label="Prime Implicants (non-coherent)"
              checked={local.primeImplicants}
              onChange={(c) => patch({ primeImplicants: c })}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mission Time (hrs)</Label>
              <Input
                type="number"
                disabled={!hasTimeBasedEvent}
                title={hasTimeBasedEvent ? undefined : "No failure-rate (λ) events in the model — mission time has no effect"}
                value={local.missionTime}
                onChange={(e) => patch({ missionTime: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cut-set Order Limit</Label>
              <Input
                type="number"
                value={local.limitOrder}
                onChange={(e) => patch({ limitOrder: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cut-off Probability</Label>
              <Input
                type="number"
                step="any"
                value={local.cutOff}
                onChange={(e) => patch({ cutOff: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monte Carlo Trials</Label>
              <Input
                type="number"
                disabled={!local.uncertainty}
                value={local.numTrials}
                onChange={(e) => patch({ numTrials: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
