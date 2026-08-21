import type { FTANode, FTAEdge, GateLabelStyle, NodeDisplayOptions } from "@/store/ftaStore";
import { buildPath } from "@/components/canvas/edges/OrthogonalEdge";
import { formatScientific, truncateLabel } from "@/lib/utils";
import { getNodeSizes, type NodeSizeSet } from "@/lib/layout/nodeSizes";
import { GATE_LABELS, GATE_SYMBOLS } from "@/lib/gateTypes";

/**
 * Diagram export is deliberately built as a standalone SVG string from the
 * node/edge model itself — not a DOM screenshot (html-to-image's toSvg()
 * just wraps a rasterized/foreignObject clone of the live canvas, which
 * drags along whatever theme + selection state happens to be on screen).
 * Re-drawing from the model gives a real vector file that always renders in
 * the light palette and never includes selection highlighting. Node sizing
 * comes from the same shared module the canvas and layout engine use, so
 * this never drifts out of sync with what's actually on screen.
 */

const PALETTE = {
  background: "#f8fafc",
  gateFill: "#fbfcfd",
  gateStroke: "#3a4150",
  muted: "#eef1f5",
  mutedForeground: "#6b7280",
  foreground: "#1c2230",
  eventBasic: "#d9603f",
  eventUndeveloped: "#c99a3b",
  eventHouse: "#3f8fa3",
  eventConditional: "#9a5fc4",
  eventTransfer: "#3f6fa8",
};

/** Mirrors GateShape.tsx's orGatePath: how far above the shape's bounding
 * box the OR/XOR concave bottom scallop's center actually dips. */
function orGateBottomDip(h: number): number {
  return h * 0.15 + 4;
}

/** Mirrors GateShape.tsx's gateTopInset/gateBottomInset — every gate glyph
 * is drawn with a few px of margin inside its bounding box, so an anchor
 * flush to the box edge lands short of the actual stroke. */
function gateTopInset(gateType: string): number {
  return gateType === "or" || gateType === "xor" || gateType === "iff" || gateType === "nor" ? 5 : 4;
}
function gateBottomInset(gateType: string, h: number): number {
  if (gateType === "or" || gateType === "xor" || gateType === "iff" || gateType === "nor") return orGateBottomDip(h);
  if (gateType === "not") return 2;
  return 4;
}

/** Mirrors EventNode.tsx's eventTopInset/EVENT_BUS_INSET/eventExtraTopMargin
 * — see the comment there for why every event kind (and box events) needs
 * to share one uniform top inset rather than each using its own natural
 * shape margin, despite each shape's line still needing to end exactly on
 * its own actual rendered edge. */
function eventTopInset(kind: string): number {
  return kind === "conditional" ? 8 : 4;
}
const EVENT_BUS_INSET = 8;
function eventExtraTopMargin(kind: string): number {
  return EVENT_BUS_INSET - eventTopInset(kind);
}

/** Mirrors EventNode.tsx's BOX_TOP_INSET. */
const BOX_TOP_INSET = EVENT_BUS_INSET;

const EVENT_COLOR: Record<string, string> = {
  basic: PALETTE.eventBasic,
  undeveloped: PALETTE.eventUndeveloped,
  house: PALETTE.eventHouse,
  conditional: PALETTE.eventConditional,
  transfer: PALETTE.eventTransfer,
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isBoxEvent(n: FTANode): boolean {
  return n.data.category === "top" || n.data.eventKind === "intermediate";
}

function nodeFootprint(n: FTANode, sizes: NodeSizeSet): { width: number; height: number } {
  if (n.data.category === "gate") {
    return { width: sizes.gateShape.width, height: sizes.gateShape.height + sizes.gateFooter };
  }
  if (isBoxEvent(n)) return sizes.boxShape;
  return { width: sizes.leafColumnWidth, height: sizes.leafShape.height + sizes.leafFooter };
}

/** Top-center anchor (the "out" handle every node exposes to its parent). */
function anchorOut(n: FTANode, sizes: NodeSizeSet): { x: number; y: number } {
  if (n.data.category === "gate") {
    const gateType = n.data.gateType ?? "or";
    return { x: n.position.x + sizes.gateShape.width / 2, y: n.position.y + gateTopInset(gateType) };
  }
  if (isBoxEvent(n)) return { x: n.position.x + sizes.boxShape.width / 2, y: n.position.y + BOX_TOP_INSET };
  return { x: n.position.x + sizes.leafColumnWidth / 2, y: n.position.y + EVENT_BUS_INSET };
}

/** Bottom-center anchor (the "in" handle gates/box-events expose to their children). */
function anchorIn(n: FTANode, sizes: NodeSizeSet): { x: number; y: number } {
  if (n.data.category === "gate") {
    const gateType = n.data.gateType ?? "or";
    const inset = gateBottomInset(gateType, sizes.gateShape.height);
    return { x: n.position.x + sizes.gateShape.width / 2, y: n.position.y + sizes.gateShape.height - inset };
  }
  return { x: n.position.x + sizes.boxShape.width / 2, y: n.position.y + sizes.boxShape.height };
}

function andGatePath(w: number, h: number): string {
  return `M 4 ${h - 4} L 4 ${h * 0.42} A ${w / 2 - 4} ${h * 0.42 - 4} 0 0 1 ${w - 4} ${h * 0.42} L ${w - 4} ${h - 4} Z`;
}

function orGatePath(w: number, h: number, footInset: number): string {
  const bottomY = h - 4;
  const topY = 5;
  const leftX = footInset;
  const rightX = w - footInset;
  const midX = w / 2;
  const bottomCtrlY = bottomY - h * 0.3;
  const bulge = w * 0.12;
  return `M ${leftX} ${bottomY} Q ${leftX - bulge} ${h * 0.4} ${midX} ${topY} Q ${rightX + bulge} ${h * 0.4} ${rightX} ${bottomY} Q ${midX} ${bottomCtrlY} ${leftX} ${bottomY} Z`;
}

function gateShapeSvg(gateType: string, w: number, h: number): string {
  const fill = PALETTE.gateFill;
  const stroke = PALETTE.gateStroke;
  const sw = 2;
  switch (gateType) {
    case "and":
    case "atleast":
    case "cardinality":
      return `<path d="${andGatePath(w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case "or":
      return `<path d="${orGatePath(w, h, 4)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case "nand":
      return (
        `<path d="${andGatePath(w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        `<circle cx="${w / 2}" cy="8" r="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    case "nor":
      return (
        `<path d="${orGatePath(w, h, 4)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        `<circle cx="${w / 2}" cy="9" r="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    case "iff":
    case "xor":
      return (
        `<path d="${orGatePath(w, h, 9)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        `<path d="M ${w * 0.1} ${h - 1} C ${w * 0.34} ${h * 0.82} ${w * 0.66} ${h * 0.82} ${w * 0.9} ${h - 1}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    case "not":
      return (
        `<polygon points="${w / 2},4 ${w - 6},${h - 14} 6,${h - 14}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>` +
        `<circle cx="${w / 2}" cy="${h - 8}" r="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    case "null":
      return `<rect x="6" y="4" width="${w - 12}" height="${h - 8}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    default:
      return "";
  }
}

function eventShapeSvg(kind: string, stroke: string, w: number, h: number): string {
  const fill = PALETTE.gateFill;
  const sw = 2;
  switch (kind) {
    case "undeveloped":
      return `<polygon points="${w / 2},4 ${w - 4},${h / 2} ${w / 2},${h - 4} 4,${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>`;
    case "house":
      return `<polygon points="${w / 2},4 ${w - 4},${h * 0.42} ${w - 4},${h - 4} 4,${h - 4} 4,${h * 0.42}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>`;
    case "conditional":
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 4}" ry="${h / 2 - 8}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case "transfer":
      return `<polygon points="${w / 2},4 ${w - 4},${h - 4} 4,${h - 4}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>`;
    case "basic":
    default:
      // cy is w/2 (not h/2) — mirrors EventNode.tsx's EventShape "basic"
      // case: keeps the top edge pinned at y=4 regardless of h, so a
      // shrunk h (from heightReduction below) crops the bottom instead of
      // shifting the top edge out from under the marginTop compensation.
      return `<circle cx="${w / 2}" cy="${w / 2}" r="${w / 2 - 4}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
}

function gateNodeSvg(
  n: FTANode,
  gateLabelStyle: GateLabelStyle,
  display: NodeDisplayOptions,
  childCount: number,
  sizes: NodeSizeSet
): string {
  const gateType = n.data.gateType ?? "or";
  const { width: w, height: h } = sizes.gateShape;
  let inner = "";
  if (gateType === "atleast") {
    inner = `<text x="${w / 2}" y="${h * 0.65}" text-anchor="middle" font-size="8" font-weight="700" fill="${PALETTE.gateStroke}">${n.data.votingK ?? 2}/${childCount || "n"}</text>`;
  } else if (gateType === "cardinality") {
    inner = `<text x="${w / 2}" y="${h * 0.65}" text-anchor="middle" font-size="7" font-weight="700" fill="${PALETTE.gateStroke}">[${n.data.votingK ?? 0},${n.data.votingMax ?? 0}]/${childCount || "n"}</text>`;
  } else if (gateLabelStyle === "symbol") {
    inner = `<text x="${w / 2}" y="${h * 0.63}" text-anchor="middle" font-size="12" font-weight="700" fill="${PALETTE.gateStroke}">${esc(GATE_SYMBOLS[gateType] ?? "")}</text>`;
  } else if (gateLabelStyle === "text") {
    inner = `<text x="${w / 2}" y="${h * 0.63}" text-anchor="middle" font-size="7" font-weight="700" fill="${PALETTE.gateStroke}">${esc(GATE_LABELS[gateType] ?? "")}</text>`;
  }

  // A solid chip behind the identifier hides the connector line passing
  // directly beneath the gate on its way to the child bus bar.
  const idLine = display.showIdentifier
    ? `<rect x="${w / 2 - 20}" y="${h + 4}" width="40" height="11" fill="${PALETTE.background}"/>` +
      `<text x="${w / 2}" y="${h + 13}" text-anchor="middle" font-size="8" fill="${PALETTE.mutedForeground}" font-family="monospace">${esc(n.data.identifier)}</text>`
    : "";

  return `<g transform="translate(${n.position.x},${n.position.y})">${gateShapeSvg(gateType, w, h)}${inner}${idLine}</g>`;
}

function boxEventNodeSvg(n: FTANode, display: NodeDisplayOptions, sizes: NodeSizeSet): string {
  const { width: w, height: fullH } = sizes.boxShape;
  // Shifted down and shrunk by BOX_TOP_INSET to match anchorOut's box-event
  // y (see comment there / EventNode.tsx's BOX_TOP_INSET) — otherwise the
  // rect drawn here wouldn't match where the connecting line actually ends.
  const h = fullH - BOX_TOP_INSET;
  const parts: string[] = [];
  parts.push(
    `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="${PALETTE.gateFill}" stroke="${PALETTE.gateStroke}" stroke-width="1"/>`
  );
  const hasLabel = display.showLabel;
  const hasId = display.showIdentifier;
  const lineCount = (hasLabel ? 1 : 0) + (hasId ? 1 : 0);
  let y = h / 2 - (lineCount - 1) * 6 + 3;
  if (hasLabel) {
    parts.push(
      `<text x="${w / 2}" y="${y}" text-anchor="middle" font-size="9" font-weight="600" fill="${PALETTE.foreground}">${esc(truncateLabel(n.data.label, 16))}</text>`
    );
    y += 12;
  }
  if (hasId) {
    parts.push(
      `<text x="${w / 2}" y="${y}" text-anchor="middle" font-size="7" fill="${PALETTE.mutedForeground}" font-family="monospace">${esc(n.data.identifier)}</text>`
    );
  }
  return `<g transform="translate(${n.position.x},${n.position.y + BOX_TOP_INSET})">${parts.join("")}</g>`;
}

function leafEventNodeSvg(n: FTANode, display: NodeDisplayOptions, sizes: NodeSizeSet): string {
  const kind = n.data.eventKind ?? "basic";
  const stroke = EVENT_COLOR[kind] ?? PALETTE.eventBasic;
  const colW = sizes.leafColumnWidth;
  const { width: shapeW, height: shapeH } = sizes.leafShape;
  const shapeOffsetX = (colW - shapeW) / 2;
  const extraMargin = eventExtraTopMargin(kind);
  const parts: string[] = [
    `<g transform="translate(${shapeOffsetX},${extraMargin})">${eventShapeSvg(kind, stroke, shapeW, shapeH - extraMargin)}</g>`,
  ];

  if (display.showLabel) {
    const shapeCenterY = shapeH / 2;
    parts.push(
      `<text x="${colW / 2}" y="${shapeCenterY + 3}" text-anchor="middle" font-size="8" font-weight="600" fill="${PALETTE.foreground}">${esc(truncateLabel(n.data.label, 10))}</text>`
    );
  }

  let y = shapeH + 14;
  if (display.showIdentifier) {
    parts.push(
      `<text x="${colW / 2}" y="${y}" text-anchor="middle" font-size="9" fill="${PALETTE.mutedForeground}" font-family="monospace">${esc(n.data.identifier)}</text>`
    );
    y += 13;
  }
  if (display.showProbability) {
    const label =
      kind === "house"
        ? n.data.probability?.booleanState
          ? "TRUE"
          : "FALSE"
        : n.data.probability?.value !== undefined
        ? `q = ${formatScientific(n.data.probability.value, 2)}`
        : "";
    if (label) {
      parts.push(
        `<text x="${colW / 2}" y="${y}" text-anchor="middle" font-size="8.5" fill="${PALETTE.mutedForeground}" font-family="monospace">${esc(label)}</text>`
      );
    }
  }
  return `<g transform="translate(${n.position.x},${n.position.y})">${parts.join("")}</g>`;
}

export interface DiagramSvgOptions {
  gateLabelStyle: GateLabelStyle;
  nodeDisplay: NodeDisplayOptions;
  compact?: boolean;
  padding?: number;
}

export function buildDiagramSvg(nodes: FTANode[], edges: FTAEdge[], options: DiagramSvgOptions): string {
  const padding = options.padding ?? 40;
  const sizes = getNodeSizes(options.compact ?? false);
  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="0" y="0" width="200" height="100" fill="${PALETTE.background}"/></svg>`;
  }

  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const fp = nodeFootprint(n, sizes);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + fp.width);
    maxY = Math.max(maxY, n.position.y + fp.height);
  }

  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const offsetX = padding - minX;
  const offsetY = padding - minY;

  const edgeSvg = edges
    .map((e) => {
      const src = byId.get(e.source);
      const tgt = byId.get(e.target);
      if (!src || !tgt) return "";
      const from = anchorOut(src, sizes);
      const to = anchorIn(tgt, sizes);
      const d = buildPath(from.x, from.y, to.x, to.y);
      return `<path d="${d}" fill="none" stroke="${PALETTE.gateStroke}" stroke-width="1.5" opacity="0.75"/>`;
    })
    .join("");

  const nodeSvg = nodes
    .map((n) => {
      if (n.data.category === "gate") {
        const childCount = (childrenOf.get(n.id) ?? []).length;
        return gateNodeSvg(n, options.gateLabelStyle, options.nodeDisplay, childCount, sizes);
      }
      if (isBoxEvent(n)) return boxEventNodeSvg(n, options.nodeDisplay, sizes);
      return leafEventNodeSvg(n, options.nodeDisplay, sizes);
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${PALETTE.background}"/>` +
    `<g transform="translate(${offsetX},${offsetY})">${edgeSvg}${nodeSvg}</g>` +
    `</svg>`
  );
}
