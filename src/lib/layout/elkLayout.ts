import type { FTANode, FTAEdge } from "@/store/ftaStore";
import { getNodeSizes, type NodeSizeSet, type ShapeSize } from "./nodeSizes";

function nodeSize(n: FTANode, sizes: NodeSizeSet): ShapeSize {
  if (n.data.category === "gate") {
    return { width: sizes.gateShape.width, height: sizes.gateShape.height + sizes.gateFooter };
  }
  const isBox = n.data.category === "top" || n.data.eventKind === "intermediate";
  if (isBox) return sizes.boxShape;
  return { width: sizes.leafColumnWidth, height: sizes.leafShape.height + sizes.leafFooter };
}

export interface LayoutResult {
  id: string;
  x: number;
  y: number;
}

/**
 * A strict tree layout (every node has at most one parent within a tab, so
 * this is never a general DAG): subtree widths are computed bottom-up so
 * sibling subtrees never overlap, children are packed left-to-right within
 * whatever span that reserves, and then each node's own X is set to the
 * midpoint between its *first* and *last* child's actual center — not the
 * midpoint of the overall left/right edges of the span they occupy. Those
 * two only coincide when every child has the same width; a gate with a
 * narrow intermediate-event child next to a wider leaf-event child would
 * otherwise get centered over the combined edge-to-edge span rather than
 * over where the fork lines actually need to meet, visibly skewing the
 * gate off to one side. This replaces an earlier ELK-based layout +
 * post-hoc recentering pass: recentering a node after the fact can widen
 * its footprint without ELK having reserved room for that, so two
 * unrelated branches could end up overlapping. Computing widths bottom-up
 * up front avoids that class of bug entirely.
 *
 * Y position is computed per-branch (each node sits at its own parent's Y +
 * that parent's own height + the gap), not from a shared "row height" per
 * BFS depth. A shared-row scheme forces every node at a given depth to sit
 * below the *tallest* node at that depth — so a short box event with a
 * short leaf sibling, but whose own child gate is what actually continues
 * downward, ends up with its child stranded far below it, chasing a row
 * height dictated by an unrelated sibling. Since siblings under the same
 * parent still share one computed childY, forks stay aligned; only
 * unrelated branches at differing depths are freed to sit at their own
 * natural distance from their own parent.
 */
export async function layoutTree(
  nodes: FTANode[],
  edges: FTAEdge[],
  compact = false
): Promise<LayoutResult[]> {
  if (nodes.length === 0) return [];
  const sizes = getNodeSizes(compact);
  const { hGap: HGAP, vGap: VGAP } = sizes;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }

  const top = nodes.find((n) => n.data.category === "top");
  if (!top) {
    // No TOP found (shouldn't normally happen) — fall back to a simple row.
    return nodes.map((n, i) => ({ id: n.id, x: i * (sizes.leafColumnWidth + HGAP), y: 0 }));
  }

  const subtreeWidth = new Map<string, number>();
  function computeSubtreeWidth(id: string): number {
    const cached = subtreeWidth.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    const ownWidth = node ? nodeSize(node, sizes).width : sizes.leafColumnWidth;
    const kids = childrenOf.get(id) ?? [];
    let width = ownWidth;
    if (kids.length > 0) {
      const childrenTotal = kids.reduce((sum, k) => sum + computeSubtreeWidth(k), 0) + HGAP * (kids.length - 1);
      width = Math.max(ownWidth, childrenTotal);
    }
    subtreeWidth.set(id, width);
    return width;
  }
  computeSubtreeWidth(top.id);

  const pos = new Map<string, { x: number; y: number }>();
  function ownWidthOf(id: string): number {
    const node = byId.get(id);
    return node ? nodeSize(node, sizes).width : sizes.leafColumnWidth;
  }

  /** Places `id` and its descendants with the subtree's reserved span
   * starting at `xStart`, and returns `id`'s own center-X once known. */
  function place(id: string, xStart: number, y: number): number {
    const node = byId.get(id);
    const span = subtreeWidth.get(id) ?? ownWidthOf(id);
    const ownSize = node ? nodeSize(node, sizes) : { width: sizes.leafColumnWidth, height: 0 };

    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) {
      // No children: this node's own width IS its span, so it starts
      // exactly at xStart with no extra centering needed.
      pos.set(id, { x: xStart, y });
      return xStart + ownSize.width / 2;
    }

    const childrenTotal = kids.reduce((sum, k) => sum + (subtreeWidth.get(k) ?? 0), 0) + HGAP * (kids.length - 1);
    let cursor = xStart + (span - childrenTotal) / 2;
    const childY = y + ownSize.height + VGAP;
    let firstCenter = 0;
    let lastCenter = 0;
    kids.forEach((childId, i) => {
      const center = place(childId, cursor, childY);
      if (i === 0) firstCenter = center;
      lastCenter = center;
      cursor += (subtreeWidth.get(childId) ?? 0) + HGAP;
    });

    const selfCenter = (firstCenter + lastCenter) / 2;
    pos.set(id, { x: selfCenter - ownSize.width / 2, y });
    return selfCenter;
  }
  place(top.id, 0, 0);

  // Any node unreachable from TOP (shouldn't happen in practice) still gets
  // a position so it isn't silently dropped from the canvas.
  let strayX = (subtreeWidth.get(top.id) ?? 0) + HGAP * 3;
  for (const n of nodes) {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: strayX, y: 0 });
      strayX += nodeSize(n, sizes).width + HGAP;
    }
  }

  return nodes.map((n) => {
    const p = pos.get(n.id)!;
    return { id: n.id, x: p.x, y: p.y };
  });
}
