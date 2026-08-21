import type { EdgeProps } from "@xyflow/react";

/**
 * Three-stage bus route, per edge — but since every sibling shares the same
 * parent (target) and the same child row (source), the pieces drawn by each
 * edge overlap into one continuous structure:
 *   1. Vertical stem: parent's bottom-center down to the bus row (every
 *      sibling draws this identical segment, so it's a single line).
 *   2. Horizontal bus bar at Y_bus: each edge contributes the segment from
 *      its own child's X to the parent's X; because the parent is always
 *      laid out at the horizontal midpoint of its children (see
 *      layoutTree.ts), those per-edge segments collectively span exactly
 *      [minChildX, maxChildX] with no gaps.
 *   3. Vertical drop: Y_bus down into this child's own top-center anchor.
 * Y_bus sits at the exact midpoint of the parent/child vertical gap.
 */
export function buildPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  // Already vertically aligned: a single straight segment, no bend at all.
  if (Math.abs(sourceX - targetX) < 0.5) {
    return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  }
  const busY = (sourceY + targetY) / 2;
  return `M ${sourceX},${sourceY} L ${sourceX},${busY} L ${targetX},${busY} L ${targetX},${targetY}`;
}

export function OrthogonalEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const edgePath = buildPath(sourceX, sourceY, targetX, targetY);

  return (
    <path
      d={edgePath}
      fill="none"
      className="react-flow__edge-path"
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: "var(--gate-stroke)",
        strokeWidth: 1.5,
        opacity: 0.75,
      }}
    />
  );
}
