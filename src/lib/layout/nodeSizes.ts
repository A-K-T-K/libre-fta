/**
 * Single source of truth for node footprints, shared by the canvas
 * components (GateNode/EventNode), the tree layout engine, and the SVG
 * export — these three previously kept their own copies of the same
 * numbers, which drifted out of sync more than once. Anything that draws or
 * positions a node should size it from here.
 */

export interface ShapeSize {
  width: number;
  height: number;
}

export interface NodeSizeSet {
  /** The gate glyph itself (AND/OR/etc SVG). */
  gateShape: ShapeSize;
  /** Extra height reserved below the gate shape for its identifier chip. */
  gateFooter: number;
  /** The TOP/intermediate event box — label and identifier render inside it,
   * so its height is the full node footprint already. 4:3 aspect ratio,
   * and its height matches `leafShape.height` so mixed box/leaf siblings
   * align cleanly under the same gate. */
  boxShape: ShapeSize;
  /** The leaf event glyph (circle/diamond/etc). */
  leafShape: ShapeSize;
  /** Total column width for a leaf node (shape + the label/id/probability
   * text stacked below it, which can be wider than the shape itself). */
  leafColumnWidth: number;
  /** Extra height below the leaf shape for label/identifier/probability. */
  leafFooter: number;
  /** Horizontal gap between sibling subtrees. */
  hGap: number;
  /** Vertical gap between layers. */
  vGap: number;
  /** Font sizes (px) for text drawn on nodes. Compact view shrinks node
   * footprints, so the text drawn on them has to shrink to match or it
   * overflows/overlaps at the smaller scale. */
  fonts: {
    /** AND/OR/NOT/XOR text and the k/n voting readout inside a gate. */
    gateLabel: number;
    /** Symbol-style gate label ("·", "+", "⊕", …). */
    gateSymbol: number;
    /** Identifier chip under a gate. */
    gateId: number;
    /** Collapsed-subtree badge (leaf count + probability) under a gate. */
    gateBadge: number;
    /** TOP/intermediate box event label. */
    boxLabel: number;
    /** TOP/intermediate box event identifier. */
    boxId: number;
    /** Label overlaid on a leaf event's shape. */
    leafLabel: number;
    /** Identifier text under a leaf event. */
    leafId: number;
    /** "q = …" / TRUE/FALSE probability chip under a leaf event. */
    leafProbability: number;
    /** "×N" repeated-event badge on a leaf event. */
    repeatedBadge: number;
  };
}

// boxShape.height is deliberately a bit less than leafShape.height: leaf
// glyphs (circle/diamond/etc) are drawn with a few px of inset margin
// inside their bounding box, so a box event's rectangle — which has almost
// no inset — needs a shorter box to actually *look* the same height as the
// leaf glyphs next to it, even though their outer footprints line up.
const NORMAL: NodeSizeSet = {
  gateShape: { width: 44, height: 38 },
  gateFooter: 16,
  boxShape: { width: 60, height: 45 },
  leafShape: { width: 54, height: 54 },
  leafColumnWidth: 104,
  leafFooter: 46,
  hGap: 24,
  vGap: 30,
  fonts: {
    gateLabel: 8,
    gateSymbol: 14,
    gateId: 8,
    gateBadge: 8,
    boxLabel: 10,
    boxId: 8,
    leafLabel: 8,
    leafId: 10,
    leafProbability: 9,
    repeatedBadge: 8,
  },
};

const COMPACT: NodeSizeSet = {
  gateShape: { width: 26, height: 22 },
  gateFooter: 11,
  boxShape: { width: 36, height: 27 },
  leafShape: { width: 32, height: 32 },
  leafColumnWidth: 60,
  leafFooter: 26,
  hGap: 10,
  vGap: 14,
  fonts: {
    gateLabel: 6,
    gateSymbol: 10,
    gateId: 6,
    gateBadge: 6,
    boxLabel: 7,
    boxId: 6,
    leafLabel: 6,
    leafId: 7,
    leafProbability: 6,
    repeatedBadge: 6,
  },
};

export function getNodeSizes(compact: boolean): NodeSizeSet {
  return compact ? COMPACT : NORMAL;
}
