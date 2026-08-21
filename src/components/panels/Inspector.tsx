import { useFTAStore } from "@/store/ftaStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { InfoRegular as Info, ArrowUpRightRegular as ArrowUpRight } from "@fluentui/react-icons";
import type { DistributionKind, EventKind, GateType } from "@/types/fta";
import { Button } from "@/components/ui/button";

const DIST_PARAM_LABELS: Record<DistributionKind, [string, string]> = {
  uniform: ["Min", "Max"],
  normal: ["Mean", "Std Dev"],
  lognormal: ["Median", "Error Factor (95%)"],
};

export function Inspector() {
  const selectedIds = useFTAStore((s) => s.selectedIds);
  const nodes = useFTAStore((s) => s.nodes);
  const updateNodeData = useFTAStore((s) => s.updateNodeData);
  const changeGateType = useFTAStore((s) => s.changeGateType);
  const openTransferTab = useFTAStore((s) => s.openTransferTab);

  const node = selectedIds.length === 1 ? nodes.find((n) => n.id === selectedIds[0]) : undefined;

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <Info className="h-5 w-5" />
        <p className="text-xs">
          {selectedIds.length > 1
            ? `${selectedIds.length} nodes selected`
            : "Select a node to edit its properties"}
        </p>
      </div>
    );
  }

  const { data } = node;
  const isGate = data.category === "gate";
  const isBox = data.category === "top" || data.eventKind === "intermediate";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isGate ? "Gate Properties" : isBox ? "Event Box Properties" : "Event Properties"}
          </h3>
          {data.category === "top" && <Badge>TOP EVENT</Badge>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="identifier">Open-PSA Identifier</Label>
          <Input
            id="identifier"
            className="font-mono"
            value={data.identifier}
            onChange={(e) => updateNodeData(node.id, { identifier: e.target.value })}
          />
        </div>

        <Separator />

        {isGate && (
          <>
            <div className="space-y-1.5">
              <Label>Gate Type</Label>
              <Select
                value={data.gateType ?? "or"}
                onValueChange={(v) => changeGateType(node.id, v as GateType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">AND</SelectItem>
                  <SelectItem value="or">OR</SelectItem>
                  <SelectItem value="nand">NAND</SelectItem>
                  <SelectItem value="nor">NOR</SelectItem>
                  <SelectItem value="not">NOT</SelectItem>
                  <SelectItem value="xor">XOR</SelectItem>
                  <SelectItem value="iff">IFF (Equivalence)</SelectItem>
                  <SelectItem value="atleast">Voting (k-out-of-n)</SelectItem>
                  <SelectItem value="cardinality">Cardinality (min/max)</SelectItem>
                  <SelectItem value="null">NULL (Pass-through)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {data.gateType === "atleast" && (
              <div className="space-y-1.5">
                <Label htmlFor="votingK">k (minimum inputs required)</Label>
                <Input
                  id="votingK"
                  type="number"
                  min={1}
                  value={data.votingK ?? 2}
                  onChange={(e) => updateNodeData(node.id, { votingK: Number(e.target.value) })}
                />
              </div>
            )}
            {data.gateType === "cardinality" && (
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cardMin">Min</Label>
                  <Input
                    id="cardMin"
                    type="number"
                    min={0}
                    value={data.votingK ?? 0}
                    onChange={(e) => updateNodeData(node.id, { votingK: Number(e.target.value) })}
                    className="w-20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cardMax">Max</Label>
                  <Input
                    id="cardMax"
                    type="number"
                    min={0}
                    value={data.votingMax ?? 0}
                    onChange={(e) => updateNodeData(node.id, { votingMax: Number(e.target.value) })}
                    className="w-20"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {isBox && (
          <p className="rounded-md border border-dashed border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {data.category === "top"
              ? "This is the top event. Right-click it on the canvas to attach the gate that defines its logic."
              : "This is an intermediate event. Right-click it on the canvas to attach the gate that develops it further."}
          </p>
        )}

        {!isGate && !isBox && data.eventKind === "transfer" && (
          <>
            <div className="space-y-1.5">
              <Label>Event Kind</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                Transfer Event (locked)
              </div>
            </div>
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              A transfer event's logic — and its probability — comes entirely from its linked sub-tree, so its
              kind can't be changed and it has no probability field of its own here. Delete it and add a fresh
              event instead if you need something else.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="w-full gap-1.5"
              onClick={() => openTransferTab(data.identifier, data.label)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Go to Sub-tree
            </Button>
          </>
        )}

        {!isGate && !isBox && data.eventKind !== "transfer" && (
          <>
            <div className="space-y-1.5">
              <Label>Event Kind</Label>
              <Select
                value={data.eventKind ?? "basic"}
                onValueChange={(v) => updateNodeData(node.id, { eventKind: v as EventKind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic Event</SelectItem>
                  <SelectItem value="undeveloped">Undeveloped Event</SelectItem>
                  <SelectItem value="house">House Event</SelectItem>
                  <SelectItem value="conditional">Conditional Event</SelectItem>
                  <SelectItem value="transfer">Transfer Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {data.eventKind === "house" ? (
              <div className="flex items-center justify-between">
                <Label htmlFor="houseState">Boolean State</Label>
                <Switch
                  id="houseState"
                  checked={Boolean(data.probability?.booleanState)}
                  onCheckedChange={(checked) =>
                    updateNodeData(node.id, { probability: { ...data.probability, booleanState: checked } })
                  }
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Probability Type</Label>
                  <Select
                    value={data.probability?.lambda !== undefined ? "rate" : "constant"}
                    onValueChange={(v) =>
                      updateNodeData(node.id, {
                        probability:
                          v === "rate"
                            ? { value: undefined, lambda: data.probability?.lambda ?? 1e-6 }
                            : { lambda: undefined, value: data.probability?.value ?? 1e-4 },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="constant">Static Probability</SelectItem>
                      <SelectItem value="rate">Failure Rate (λ, exponential)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {data.probability?.lambda !== undefined ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="prob">Failure Rate λ (per hour)</Label>
                    <Input
                      id="prob"
                      type="number"
                      step="any"
                      min={0}
                      value={data.probability?.lambda ?? 0}
                      onChange={(e) =>
                        updateNodeData(node.id, {
                          probability: { ...data.probability, lambda: Number(e.target.value) },
                        })
                      }
                    />
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Time-dependent: P(t) = 1 − e<sup>−λt</sup>, evaluated at the mission time (Run Analysis
                      dialog, or the time picker on the Results tab).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="prob">Probability (constant)</Label>
                    <Input
                      id="prob"
                      type="number"
                      step="any"
                      min={0}
                      max={1}
                      value={data.probability?.value ?? 0}
                      onChange={(e) =>
                        updateNodeData(node.id, {
                          probability: { ...data.probability, value: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Uncertainty Distribution</Label>
                  <Select
                    value={data.probability?.distribution?.kind ?? "none"}
                    onValueChange={(v) => {
                      const point = data.probability?.value ?? data.probability?.lambda ?? 1e-4;
                      updateNodeData(node.id, {
                        probability: {
                          ...data.probability,
                          distribution:
                            v === "none"
                              ? undefined
                              : {
                                  kind: v as DistributionKind,
                                  params:
                                    v === "uniform"
                                      ? [point * 0.5, point * 2]
                                      : v === "normal"
                                        ? [point, point * 0.2]
                                        : [point, 3],
                                },
                        },
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (point value only)</SelectItem>
                      <SelectItem value="uniform">Uniform</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="lognormal">Lognormal</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Sampled during Monte Carlo uncertainty analysis (enable "Uncertainty" in the Run Analysis
                    dialog) — the point value above is still used for every other calculation.
                  </p>
                </div>

                {data.probability?.distribution && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="distA">{DIST_PARAM_LABELS[data.probability.distribution.kind][0]}</Label>
                      <Input
                        id="distA"
                        type="number"
                        step="any"
                        value={data.probability.distribution.params[0] ?? 0}
                        onChange={(e) => {
                          const dist = data.probability!.distribution!;
                          updateNodeData(node.id, {
                            probability: {
                              ...data.probability,
                              distribution: { ...dist, params: [Number(e.target.value), dist.params[1]] },
                            },
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="distB">{DIST_PARAM_LABELS[data.probability.distribution.kind][1]}</Label>
                      <Input
                        id="distB"
                        type="number"
                        step="any"
                        value={data.probability.distribution.params[1] ?? 0}
                        onChange={(e) => {
                          const dist = data.probability!.distribution!;
                          updateNodeData(node.id, {
                            probability: {
                              ...data.probability,
                              distribution: { ...dist, params: [dist.params[0], Number(e.target.value)] },
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <Separator />

        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <textarea
            id="desc"
            className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={data.description ?? ""}
            onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
          />
        </div>

        {data.importance && (
          <>
            <Separator />
            <div className="space-y-1 text-xs">
              <h4 className="font-semibold text-muted-foreground">Last Run Importance</h4>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <span>Criticality</span>
                <span className="text-right tabular-nums">{data.importance.criticality?.toExponential(2)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
