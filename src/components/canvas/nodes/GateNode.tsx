import { memo, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  DeleteRegular as Trash2,
  ArrowRepeatAllRegular as Repeat,
  VoteRegular as Vote,
  AddRegular as Plus,
  ChevronDoubleUpRegular as ChevronsDownUp,
  ChevronDoubleDownRegular as ChevronsUpDown,
  InfoRegular as Info,
} from "@fluentui/react-icons";
import { GateShape, gateBottomInset, gateTopInset } from "./GateShape";
import { useFTAStore, type FTANode, type GateLabelStyle } from "@/store/ftaStore";
import { formatScientific } from "@/lib/utils";
import { getNodeSizes, type NodeSizeSet } from "@/lib/layout/nodeSizes";
import type { EventKind, GateType } from "@/types/fta";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EventKindIcon } from "./EventKindIcon";
import { useAutoArrange } from "@/hooks/useAutoArrange";
import { useDeleteNode } from "@/hooks/useDeleteNode";
import { NodeTooltip } from "./NodeTooltip";
import { GATE_LABELS, GATE_TYPES, GATE_SYMBOLS } from "@/lib/gateTypes";

const EVENT_KIND_OPTIONS: { kind: EventKind; label: string }[] = [
  { kind: "basic", label: "Basic Event" },
  { kind: "undeveloped", label: "Undeveloped Event" },
  { kind: "house", label: "House Event" },
  { kind: "conditional", label: "Conditional Event" },
  { kind: "intermediate", label: "Intermediate Event" },
  { kind: "transfer", label: "Transfer Event" },
];

function GateInnerLabel({
  gateType,
  style,
  fonts,
}: {
  gateType: GateType;
  style: GateLabelStyle;
  fonts: NodeSizeSet["fonts"];
}) {
  switch (style) {
    case "hidden":
      return null;
    case "symbol":
      return (
        <span className="font-bold leading-none" style={{ fontSize: fonts.gateSymbol }}>
          {GATE_SYMBOLS[gateType]}
        </span>
      );
    default:
      return (
        <span className="font-bold tracking-wide" style={{ fontSize: fonts.gateLabel }}>
          {GATE_LABELS[gateType]}
        </span>
      );
  }
}

function GateNodeImpl({ id, data, selected }: NodeProps<FTANode>) {
  const compactView = useFTAStore((s) => s.compactView);
  const sizes = getNodeSizes(compactView);
  const { width, height } = sizes.gateShape;
  const { fonts } = sizes;

  const edges = useFTAStore((s) => s.edges);
  const addChildEvent = useFTAStore((s) => s.addChildEvent);
  const changeGateType = useFTAStore((s) => s.changeGateType);
  const setVotingK = useFTAStore((s) => s.setVotingK);
  const setCardinality = useFTAStore((s) => s.setCardinality);
  const toggleGateCollapsed = useFTAStore((s) => s.toggleGateCollapsed);
  const selectOnly = useFTAStore((s) => s.selectOnly);
  const setShowRightPanel = useFTAStore((s) => s.setShowRightPanel);

  const gateLabelStyle = useFTAStore((s) => s.gateLabelStyle);
  const nodeDisplay = useFTAStore((s) => s.nodeDisplay);
  const autoArrange = useAutoArrange();
  const deleteNode = useDeleteNode();

  const childCount = useMemo(() => edges.filter((e) => e.target === id).length, [edges, id]);

  const [votingOpen, setVotingOpen] = useState(false);
  const [kDraft, setKDraft] = useState(String(data.votingK ?? 2));
  const [cardinalityOpen, setCardinalityOpen] = useState(false);
  const [minDraft, setMinDraft] = useState(String(data.votingK ?? 1));
  const [maxDraft, setMaxDraft] = useState(String(data.votingMax ?? 2));

  const stroke = selected ? "var(--primary)" : "var(--gate-stroke)";
  const fill = "var(--gate-fill)";
  const gateType = data.gateType ?? "or";
  const isCollapsed = Boolean(data.collapsed);

  const handleToggleCollapse = (e: ReactMouseEvent) => {
    e.stopPropagation();
    toggleGateCollapsed(id);
    void autoArrange();
  };

  return (
    <NodeTooltip data={data}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* Fixed width matching GATE_SIZE in layoutTree.ts — see the note
              on EventNode's leaf wrapper for why this matters for symmetry. */}
          <div className="flex flex-col items-center" style={{ width }}>
            <div
              className="relative"
              style={
                selected
                  ? { filter: "drop-shadow(0 0 3px var(--selection-glow)) drop-shadow(0 0 8px var(--selection-glow))" }
                  : undefined
              }
            >
              <div className="relative" style={{ width, height }}>
                <GateShape gateType={gateType} stroke={stroke} fill={fill} width={width} height={height} />
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center pt-1 text-center"
                  style={{ color: "var(--gate-stroke)" }}
                >
                  {gateType === "atleast" ? (
                    <span className="font-bold tabular-nums" style={{ fontSize: fonts.gateLabel }}>
                      {data.votingK ?? 2}/{childCount || "n"}
                    </span>
                  ) : gateType === "cardinality" ? (
                    <span className="font-bold tabular-nums" style={{ fontSize: fonts.gateBadge }}>
                      [{data.votingK ?? 0},{data.votingMax ?? 0}]/{childCount || "n"}
                    </span>
                  ) : (
                    <GateInnerLabel gateType={gateType} style={gateLabelStyle} fonts={fonts} />
                  )}
                </div>

                {childCount > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleCollapse}
                    title={isCollapsed ? "Expand subtree" : "Collapse subtree"}
                    className="nodrag pointer-events-auto absolute -right-3 top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--card)] text-muted-foreground hover:text-foreground"
                    style={{ borderColor: stroke }}
                  >
                    {isCollapsed ? (
                      <ChevronsUpDown className="h-2 w-2" />
                    ) : (
                      <ChevronsDownUp className="h-2 w-2" />
                    )}
                  </button>
                )}

                {/* Invisible — edges anchor to the shape itself, not a
                    draggable connector dot (connections are built only via
                    the right-click menus). */}
                <Handle
                  type="source"
                  position={Position.Top}
                  id="out"
                  className="!border-0 !bg-transparent opacity-0"
                  style={{ top: gateTopInset(gateType) }}
                />
                <Handle
                  type="target"
                  position={Position.Bottom}
                  id="in"
                  className="!border-0 !bg-transparent opacity-0"
                  // Every gate glyph is drawn with a few px of margin
                  // inside its bounding box (OR/XOR's concave scallop most
                  // visibly, but AND/VOTE/NOT too) — anchor flush to the
                  // drawn edge instead of the raw box edge, or the
                  // connecting line stops short of the shape.
                  style={{ bottom: gateBottomInset(gateType, height) }}
                />
              </div>

              {nodeDisplay.showIdentifier && (
                <span
                  className="relative z-10 -mt-px block w-full truncate rounded-sm px-1 text-center font-mono text-muted-foreground"
                  style={{ background: "var(--canvas-bg)", fontSize: fonts.gateId }}
                >
                  {data.identifier}
                </span>
              )}

              {isCollapsed && (
                <div className="mt-1 flex flex-col items-center gap-0.5 rounded-sm border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-center">
                  <span className="font-semibold text-muted-foreground" style={{ fontSize: fonts.gateBadge }}>
                    {data.collapsedLeafCount ?? 0} event{data.collapsedLeafCount === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums text-muted-foreground" style={{ fontSize: fonts.gateBadge }}>
                    q = {formatScientific(data.collapsedProbability, 2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuLabel>{data.identifier}</ContextMenuLabel>
        <ContextMenuSeparator />
        {/* NOT and NULL (pass-through) gates take exactly one input — once
            they have it, "Add Event" can never do anything useful, so it's
            hidden the same way EventNode's "Add Gate" already hides once a
            box already has its one gate. Mirrors the arity rule lint.ts
            enforces after the fact (`kids.length > 1` on these two gate
            types) by simply never letting the UI create that state. */}
        {!((gateType === "not" || gateType === "null") && childCount >= 1) && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="h-3.5 w-3.5" /> Add Event
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {EVENT_KIND_OPTIONS.map((opt) => (
              <ContextMenuItem
                key={opt.kind}
                onSelect={() => {
                  addChildEvent(id, opt.kind);
                  void autoArrange();
                }}
              >
                <EventKindIcon kind={opt.kind} className="h-3.5 w-3.5" />
                {opt.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Repeat className="h-3.5 w-3.5" /> Change Gate Type
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {GATE_TYPES.map((gt) => (
              <ContextMenuItem key={gt} disabled={gt === gateType} onSelect={() => changeGateType(id, gt)}>
                {GATE_LABELS[gt]}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {gateType === "atleast" && (
          <ContextMenuItem
            onSelect={() => {
              setKDraft(String(data.votingK ?? 2));
              setVotingOpen(true);
            }}
          >
            <Vote className="h-3.5 w-3.5" /> Set Voting Criteria…
          </ContextMenuItem>
        )}

        {gateType === "cardinality" && (
          <ContextMenuItem
            onSelect={() => {
              setMinDraft(String(data.votingK ?? 1));
              setMaxDraft(String(data.votingMax ?? 2));
              setCardinalityOpen(true);
            }}
          >
            <Vote className="h-3.5 w-3.5" /> Set Cardinality Bounds…
          </ContextMenuItem>
        )}

        {childCount > 0 && (
          <ContextMenuItem
            onSelect={() => {
              toggleGateCollapsed(id);
              void autoArrange();
            }}
          >
            {isCollapsed ? (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            )}
            {isCollapsed ? "Expand Subtree" : "Collapse Subtree"}
          </ContextMenuItem>
        )}

        <ContextMenuItem
          onSelect={() => {
            selectOnly([id]);
            setShowRightPanel(true);
          }}
        >
          <Info className="h-3.5 w-3.5" /> Show Properties
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          style={{ color: "var(--destructive)" }}
          onSelect={() => deleteNode([id])}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Gate
        </ContextMenuItem>
      </ContextMenuContent>

      <Dialog open={votingOpen} onOpenChange={setVotingOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Voting Criteria</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`vote-k-${id}`}>k-out-of-n</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`vote-k-${id}`}
                type="number"
                min={1}
                max={Math.max(1, childCount)}
                value={kDraft}
                onChange={(e) => setKDraft(e.target.value)}
                className="w-16"
                autoFocus
              />
              <span className="text-xs text-muted-foreground">out of {childCount || "n"} inputs</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => {
                setVotingK(id, Number(kDraft) || 1);
                setVotingOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cardinalityOpen} onOpenChange={setCardinalityOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Cardinality Bounds</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label htmlFor={`card-min-${id}`}>Min</Label>
                <Input
                  id={`card-min-${id}`}
                  type="number"
                  min={0}
                  max={Math.max(0, childCount)}
                  value={minDraft}
                  onChange={(e) => setMinDraft(e.target.value)}
                  className="w-16"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`card-max-${id}`}>Max</Label>
                <Input
                  id={`card-max-${id}`}
                  type="number"
                  min={0}
                  max={Math.max(0, childCount)}
                  value={maxDraft}
                  onChange={(e) => setMaxDraft(e.target.value)}
                  className="w-16"
                />
              </div>
              <span className="mt-4 text-xs text-muted-foreground">of {childCount || "n"} inputs</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => {
                setCardinality(id, Number(minDraft) || 0, Number(maxDraft) || 0);
                setCardinalityOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </ContextMenu>
    </NodeTooltip>
  );
}

export const GateNode = memo(GateNodeImpl);
