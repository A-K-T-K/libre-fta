import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  DeleteRegular as Trash2,
  ArrowRepeatAllRegular as Repeat,
  AddRegular as Plus,
  ArrowUpRightRegular as ArrowUpRight,
  InfoRegular as Info,
} from "@fluentui/react-icons";
import { useFTAStore, type FTANode } from "@/store/ftaStore";
import { cn, formatScientific } from "@/lib/utils";
import type { EventKind } from "@/types/fta";
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
import { EventKindIcon } from "./EventKindIcon";
import { useAutoArrange } from "@/hooks/useAutoArrange";
import { useDeleteNode } from "@/hooks/useDeleteNode";
import { NodeTooltip } from "./NodeTooltip";
import { getNodeSizes } from "@/lib/layout/nodeSizes";
import { GATE_LABELS, GATE_TYPES } from "@/lib/gateTypes";

const EVENT_COLOR: Record<EventKind, string> = {
  basic: "var(--event-basic)",
  undeveloped: "var(--event-undeveloped)",
  house: "var(--event-house)",
  conditional: "var(--event-conditional)",
  intermediate: "var(--gate-stroke)",
  transfer: "var(--event-transfer)",
};

const EVENT_KIND_OPTIONS: { kind: EventKind; label: string }[] = [
  { kind: "basic", label: "Basic Event" },
  { kind: "undeveloped", label: "Undeveloped Event" },
  { kind: "house", label: "House Event" },
  { kind: "conditional", label: "Conditional Event" },
];

/** Double-click to rename in place; Enter commits, Escape cancels. */
function InlineLabel({
  value,
  onCommit,
  className,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => inputRef.current?.select());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={cn(
          "nodrag w-full border-b border-primary bg-transparent text-center outline-none",
          className
        )}
        style={style}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={className}
      style={style}
    >
      {value}
    </span>
  );
}

/** Every leaf glyph is drawn with its own few px of margin inside its
 * bounding box (see the "4"/"8"/"h - 4" literals in EventShape below) —
 * each one individually needs its "out" connector shifted down to touch
 * its actual rendered edge. But under a shared parent gate, every sibling
 * (any event kind, or a box event) has the exact same node `position.y`
 * (elkLayout.ts positions a whole row uniformly), so the connecting bus
 * bar's height comes entirely from each sibling's own inset — and those
 * insets *differ* per kind (basic/undeveloped/house/transfer's shapes are
 * drawn 4px in, conditional's ellipse 8px, a box event's rectangle 0px),
 * so mixed siblings' bus segments land at different heights, visibly
 * kinking the otherwise-continuous bus line wherever the mix changes.
 * `EVENT_BUS_INSET` is the single shared value every kind's connector
 * actually uses (the deepest natural inset, conditional's 8) — shapes
 * whose own drawn margin is shallower than that get the difference added
 * as extra top margin (`eventExtraTopMargin`) instead of just moving the
 * handle alone, so each one's line still ends exactly on its own shape's
 * real edge while every sibling's bus segment lands at the same height
 * regardless of which kinds are mixed together. */
const EVENT_BUS_INSET = 8;

function eventTopInset(kind: EventKind): number {
  return kind === "conditional" ? 8 : 4; // ellipse's ry inset is deeper than the others' 4px
}

function eventExtraTopMargin(kind: EventKind): number {
  return EVENT_BUS_INSET - eventTopInset(kind);
}

/** Box events (TOP/intermediate) are a plain bordered rectangle with no
 * internal shape margin of their own (natural inset 0) — same treatment,
 * shifted the full `EVENT_BUS_INSET` to match leaf siblings. */
const BOX_TOP_INSET = EVENT_BUS_INSET;

function EventShape({
  kind,
  stroke,
  size,
  heightReduction = 0,
}: {
  kind: EventKind;
  stroke: string;
  size: number;
  heightReduction?: number;
}) {
  const w = size;
  const h = size - heightReduction;
  const fill = "var(--gate-fill)";
  const sw = 2;

  switch (kind) {
    case "basic":
      // cy is deliberately w/2 (not h/2): unlike the polygon shapes below,
      // whose top vertex is a fixed "4" literal independent of h, a
      // height-relative center would shift this circle's top edge whenever
      // `h` is shrunk by `heightReduction` — breaking the fixed-top-edge
      // assumption the marginTop compensation above depends on. w/2 keeps
      // the top edge pinned at the same y=4 regardless of h, letting the
      // shrink come entirely from the bottom instead.
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={w / 2} cy={w / 2} r={w / 2 - 4} fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "undeveloped":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${w / 2},4 ${w - 4},${h / 2} ${w / 2},${h - 4} 4,${h / 2}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            // "miter" (a sharp corner) keeps each vertex exactly at its
            // drawn coordinate — "round" visibly rounds the point away
            // from that coordinate, most noticeably on transfer/house's
            // sharper angles, leaving the connecting line short of the
            // shape's actual rendered tip even though it's anchored right
            // at the math coordinate.
            strokeLinejoin="miter"
          />
        </svg>
      );
    case "house":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${w / 2},4 ${w - 4},${h * 0.42} ${w - 4},${h - 4} 4,${h - 4} 4,${h * 0.42}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            // "miter" (a sharp corner) keeps each vertex exactly at its
            // drawn coordinate — "round" visibly rounds the point away
            // from that coordinate, most noticeably on transfer/house's
            // sharper angles, leaving the connecting line short of the
            // shape's actual rendered tip even though it's anchored right
            // at the math coordinate.
            strokeLinejoin="miter"
          />
        </svg>
      );
    case "conditional":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 4} ry={h / 2 - 8} fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "transfer":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${w / 2},4 ${w - 4},${h - 4} 4,${h - 4}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            // "miter" (a sharp corner) keeps each vertex exactly at its
            // drawn coordinate — "round" visibly rounds the point away
            // from that coordinate, most noticeably on transfer/house's
            // sharper angles, leaving the connecting line short of the
            // shape's actual rendered tip even though it's anchored right
            // at the math coordinate.
            strokeLinejoin="miter"
          />
        </svg>
      );
    default:
      return null;
  }
}

interface EventNodeCtxMenuProps {
  id: string;
  isBox: boolean;
  isTop: boolean;
  kind: EventKind | undefined;
  childCount: number;
  label: string;
  identifier: string;
}

function EventContextMenuContent({ id, isBox, isTop, kind, childCount, label, identifier }: EventNodeCtxMenuProps) {
  const addChildGate = useFTAStore((s) => s.addChildGate);
  const updateNodeData = useFTAStore((s) => s.updateNodeData);
  const openTransferTab = useFTAStore((s) => s.openTransferTab);
  const selectOnly = useFTAStore((s) => s.selectOnly);
  const setShowRightPanel = useFTAStore((s) => s.setShowRightPanel);
  const autoArrange = useAutoArrange();
  const deleteNode = useDeleteNode();
  const isTransfer = kind === "transfer";
  // A box event (TOP/intermediate) can only ever have one child gate — once
  // it has one, every structural option here (Add Gate, Change Event Kind)
  // is moot, so the menu collapses to just the universal Show Properties
  // and Delete rather than showing a disabled "Add Gate" that can never do
  // anything.
  const hasGateAlready = isBox && childCount > 0;

  return (
    <ContextMenuContent>
      <ContextMenuLabel>{id}</ContextMenuLabel>
      <ContextMenuSeparator />

      {isBox && !hasGateAlready && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="h-3.5 w-3.5" /> Add Gate
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {GATE_TYPES.map((gt) => (
              <ContextMenuItem
                key={gt}
                onSelect={() => {
                  addChildGate(id, gt);
                  void autoArrange();
                }}
              >
                {GATE_LABELS[gt]}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {!hasGateAlready && (isTransfer ? (
        <ContextMenuItem onSelect={() => openTransferTab(identifier, label)}>
          <ArrowUpRight className="h-3.5 w-3.5" /> Go to Transfer Tab
        </ContextMenuItem>
      ) : (
        !isTop &&
        childCount === 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Repeat className="h-3.5 w-3.5" /> Change Event Kind
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {EVENT_KIND_OPTIONS.map((opt) => (
                <ContextMenuItem
                  key={opt.kind}
                  disabled={opt.kind === kind}
                  onSelect={() => updateNodeData(id, { eventKind: opt.kind })}
                >
                  <EventKindIcon kind={opt.kind} className="h-3.5 w-3.5" />
                  {opt.label}
                </ContextMenuItem>
              ))}
              <ContextMenuItem
                disabled={kind === "intermediate"}
                onSelect={() => updateNodeData(id, { eventKind: "intermediate" })}
              >
                <EventKindIcon kind="intermediate" className="h-3.5 w-3.5" />
                Intermediate Event
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => updateNodeData(id, { eventKind: "transfer" })}>
                <EventKindIcon kind="transfer" className="h-3.5 w-3.5" />
                Transfer Event
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )
      ))}

      <ContextMenuItem
        onSelect={() => {
          selectOnly([id]);
          setShowRightPanel(true);
        }}
      >
        <Info className="h-3.5 w-3.5" /> Show Properties
      </ContextMenuItem>

      {!isTop && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            style={{ color: "var(--destructive)" }}
            onSelect={() => deleteNode([id])}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Event
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
}

function EventNodeImpl({ id, data, selected }: NodeProps<FTANode>) {
  const isTop = data.category === "top";
  const kind = data.eventKind;
  const isBox = isTop || kind === "intermediate";
  const isTransfer = kind === "transfer";

  const edges = useFTAStore((s) => s.edges);
  const updateNodeData = useFTAStore((s) => s.updateNodeData);
  const nodeDisplay = useFTAStore((s) => s.nodeDisplay);
  const compactView = useFTAStore((s) => s.compactView);
  const sizes = getNodeSizes(compactView);
  const childCount = useMemo(() => edges.filter((e) => e.target === id).length, [edges, id]);

  const baseColor = isBox ? "var(--gate-stroke)" : EVENT_COLOR[kind ?? "basic"];
  const stroke = selected ? "var(--primary)" : baseColor;

  const renameLabel = (v: string) => updateNodeData(id, { label: v });

  if (isBox) {
    return (
      <NodeTooltip data={data}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex flex-col items-center">
              <div
                className="relative flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-sm border bg-[var(--gate-fill)] px-1.5 text-center shadow-sm"
                style={{
                  width: sizes.boxShape.width,
                  height: sizes.boxShape.height - BOX_TOP_INSET,
                  marginTop: BOX_TOP_INSET,
                  borderColor: stroke,
                  borderWidth: selected ? 2 : 1,
                  boxShadow: selected
                    ? "0 0 0 1px var(--selection-glow), 0 0 10px 3px var(--selection-glow)"
                    : undefined,
                }}
              >
                {nodeDisplay.showLabel && (
                  <InlineLabel
                    value={data.label}
                    onCommit={renameLabel}
                    className="line-clamp-2 w-full break-words font-semibold leading-tight"
                    style={{ fontSize: sizes.fonts.boxLabel }}
                  />
                )}
                {nodeDisplay.showIdentifier && (
                  <span
                    className="block w-full truncate font-mono text-muted-foreground"
                    style={{ fontSize: sizes.fonts.boxId }}
                  >
                    {data.identifier}
                  </span>
                )}

                {!isTop && (
                  <Handle
                    type="source"
                    position={Position.Top}
                    id="out"
                    className="!border-0 !bg-transparent opacity-0"
                    // `top: 0` (the default for Position.Top) is measured
                    // from this div's *padding* edge, not its outer/margin
                    // edge — since this div has a real CSS border (unlike a
                    // leaf event's borderless `.relative` wrapper), that
                    // border width silently pushes the handle down by
                    // exactly `borderWidth` px, breaking the shared
                    // EVENT_BUS_INSET every sibling is supposed to land on.
                    // Pull it back up by the same amount to compensate —
                    // matches the border width above exactly, including
                    // when selection doubles it from 1px to 2px.
                    style={{ top: -(selected ? 2 : 1) }}
                  />
                )}
                <Handle type="target" position={Position.Bottom} id="in" className="!border-0 !bg-transparent opacity-0" />
              </div>
            </div>
          </ContextMenuTrigger>
          <EventContextMenuContent
            id={id}
            isBox
            isTop={isTop}
            kind={kind}
            childCount={childCount}
            label={data.label}
            identifier={data.identifier}
          />
        </ContextMenu>
      </NodeTooltip>
    );
  }

  return (
    <NodeTooltip data={data}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* Fixed width matching the shared leafColumnWidth size — without
              it this div shrinks to content, so its actual rendered (and
              therefore React Flow-measured) center drifts from what the
              layout math assumed, breaking symmetry wherever a leaf sits
              next to a wider sibling (e.g. an intermediate event's box). */}
          <div className="flex flex-col items-center" style={{ width: sizes.leafColumnWidth }}>
            <div
              className="relative"
              style={{
                marginTop: eventExtraTopMargin(kind ?? "basic"),
                ...(selected
                  ? { filter: "drop-shadow(0 0 3px var(--selection-glow)) drop-shadow(0 0 8px var(--selection-glow))" }
                  : data.repeatedActive
                  ? { filter: "drop-shadow(0 0 3px var(--warning)) drop-shadow(0 0 8px var(--warning))" }
                  : undefined),
              }}
            >
              <EventShape
                kind={kind ?? "basic"}
                stroke={stroke}
                size={sizes.leafShape.width}
                heightReduction={eventExtraTopMargin(kind ?? "basic")}
              />
              {nodeDisplay.showLabel && (
                <div className="absolute inset-0 flex items-center justify-center px-2.5">
                  <InlineLabel
                    value={data.label}
                    onCommit={renameLabel}
                    className="max-w-full truncate text-center font-semibold leading-none"
                    style={{ color: "var(--foreground)", fontSize: sizes.fonts.leafLabel }}
                  />
                </div>
              )}
              {isTransfer && (
                <ArrowUpRight
                  className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--card)]"
                  style={{ color: stroke }}
                />
              )}
              {!!data.repeatedCount && (
                <span
                  title={`This event appears ${data.repeatedCount} times in the tree`}
                  className="pointer-events-none absolute -left-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border px-1 font-bold leading-none"
                  style={{
                    borderColor: "var(--warning)",
                    background: "var(--card)",
                    color: "var(--warning)",
                    fontSize: sizes.fonts.repeatedBadge,
                  }}
                >
                  ×{data.repeatedCount}
                </span>
              )}
              <Handle
                type="source"
                position={Position.Top}
                id="out"
                className="!border-0 !bg-transparent opacity-0"
                style={{ top: eventTopInset(kind ?? "basic") }}
              />
            </div>
            <div className="mt-0.5 flex w-full flex-col items-center gap-0.5">
              {nodeDisplay.showIdentifier && (
                <span
                  className="font-mono text-muted-foreground"
                  style={{ fontSize: sizes.fonts.leafId }}
                >
                  {data.identifier}
                </span>
              )}
              {nodeDisplay.showProbability &&
                !isTransfer &&
                data.probability?.lambda !== undefined &&
                kind !== "house" && (
                  <span
                    className="rounded px-1 tabular-nums text-muted-foreground"
                    style={{ background: "var(--muted)", fontSize: sizes.fonts.leafProbability }}
                  >
                    λ = {formatScientific(data.probability.lambda, 2)}/hr
                  </span>
                )}
              {nodeDisplay.showProbability &&
                !isTransfer &&
                data.probability?.lambda === undefined &&
                data.probability?.value !== undefined &&
                kind !== "house" && (
                  <span
                    className="rounded px-1 tabular-nums text-muted-foreground"
                    style={{ background: "var(--muted)", fontSize: sizes.fonts.leafProbability }}
                  >
                    q = {formatScientific(data.probability.value, 2)}
                  </span>
                )}
              {nodeDisplay.showProbability && !isTransfer && kind === "house" && (
                <span
                  className="rounded bg-muted px-1 text-muted-foreground"
                  style={{ fontSize: sizes.fonts.leafProbability }}
                >
                  {data.probability?.booleanState ? "TRUE" : "FALSE"}
                </span>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <EventContextMenuContent
          id={id}
          isBox={false}
          isTop={false}
          kind={kind}
          childCount={0}
          label={data.label}
          identifier={data.identifier}
        />
      </ContextMenu>
    </NodeTooltip>
  );
}

export const EventNode = memo(EventNodeImpl);
