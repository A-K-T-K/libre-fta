import type { GateType } from "@/types/fta";

interface GateShapeProps {
  gateType: GateType;
  stroke: string;
  fill: string;
  width: number;
  height: number;
}

/**
 * The standard OR-gate silhouette: a pointed/domed top with curved sides
 * flaring out to two feet, and a concave (scalloped) bottom edge between
 * them — distinct from the AND gate's flat bottom.
 */
function orGatePath(w: number, h: number, footInset: number): string {
  const bottomY = h - 4;
  const topY = 5;
  const leftX = footInset;
  const rightX = w - footInset;
  const midX = w / 2;
  const bottomCtrlY = bottomY - h * 0.3;
  const bulge = w * 0.12;
  return `
    M ${leftX} ${bottomY}
    Q ${leftX - bulge} ${h * 0.4} ${midX} ${topY}
    Q ${rightX + bulge} ${h * 0.4} ${rightX} ${bottomY}
    Q ${midX} ${bottomCtrlY} ${leftX} ${bottomY}
    Z`;
}

/** How far above the shape's bottom edge (y = h) the OR/XOR concave
 * scallop's deepest point sits — the exact quadratic-Bezier peak of the
 * final `Q` segment in `orGatePath` above (endpoints at y = bottomY = h-4,
 * control point at y = bottomCtrlY = bottomY - 0.3h; a quadratic's midpoint
 * is the average of 1/4, 1/2, 1/4 weighted endpoints/control, giving
 * y_dip = 0.85h - 4, i.e. `0.15h + 4` above the bottom edge). The previous
 * `h * 0.15` here dropped that constant 4px term, anchoring the "in"
 * connector 4px below the curve's actual lowest point and leaving the line
 * visibly short of it. */
export function orGateBottomDip(h: number): number {
  return h * 0.15 + 4;
}

/** Every gate glyph is drawn with a few px of margin inside its bounding
 * box (see the "4"/"5"/"h - 4" literals in the path builders below), so a
 * connector anchored flush to the box edge (top:0 / bottom:0) lands short
 * of the actual stroke and the line visibly stops before touching the
 * shape. These mirror those literals so the "out"/"in" handles sit right
 * on the drawn edge instead. */
export function gateTopInset(gateType: GateType): number {
  switch (gateType) {
    case "or":
    case "xor":
    case "iff":
    case "nor":
      return 5; // topY in orGatePath
    default:
      return 4; // AND/VOTE/CARDINALITY/NOT/NULL/NAND apex starts 4px inside the box
  }
}

export function gateBottomInset(gateType: GateType, height: number): number {
  switch (gateType) {
    case "or":
    case "xor":
    case "iff":
    case "nor":
      return orGateBottomDip(height);
    case "not":
      return 2; // base of the negation circle sits ~2px above h
    default:
      return 4; // AND/VOTE/CARDINALITY/NULL/NAND flat bottom sits at h - 4
  }
}

/**
 * Renders standardized FTA gate symbols (AND / OR / VOTE / NOT / XOR)
 * as SVG paths, in the style used by classic fault-tree drafting tools.
 */
export function GateShape({ gateType, stroke, fill, width, height }: GateShapeProps) {
  const w = width;
  const h = height;
  const strokeWidth = 2;

  switch (gateType) {
    case "and":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M 4 ${h - 4} L 4 ${h * 0.42} A ${w / 2 - 4} ${h * 0.42 - 4} 0 0 1 ${w - 4} ${h * 0.42} L ${w - 4} ${h - 4} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "or":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={orGatePath(w, h, 4)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "atleast":
    case "cardinality":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M 4 ${h - 4} L 4 ${h * 0.42} A ${w / 2 - 4} ${h * 0.42 - 4} 0 0 1 ${w - 4} ${h * 0.42} L ${w - 4} ${h - 4} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "nand":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M 4 ${h - 4} L 4 ${h * 0.42} A ${w / 2 - 4} ${h * 0.42 - 4} 0 0 1 ${w - 4} ${h * 0.42} L ${w - 4} ${h - 4} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {/* Output negation bubble — the standard IEEE way to distinguish
              NAND from AND without a separate glyph. */}
          <circle cx={w / 2} cy={8} r={4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "nor":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={orGatePath(w, h, 4)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <circle cx={w / 2} cy={9} r={4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "null":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {/* Pass-through: a plain rectangle with the input line implicitly
              carrying straight through, no boolean combination drawn. */}
          <rect
            x={6}
            y={4}
            width={w - 12}
            height={h - 8}
            rx={3}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
    case "iff":
    case "xor":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={orGatePath(w, h, 9)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d={`M ${w * 0.1} ${h - 1} C ${w * 0.34} ${h * 0.82} ${w * 0.66} ${h * 0.82} ${w * 0.9} ${h - 1}`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
    case "not":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${w / 2},4 ${w - 6},${h - 14} 6,${h - 14}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            // "miter" keeps the apex exactly at its drawn coordinate (y=4,
            // matching gateTopInset) — "round" visibly rounds this sharp
            // point away from that coordinate, leaving the incoming line
            // short of the triangle's actual rendered tip.
            strokeLinejoin="miter"
          />
          <circle
            cx={w / 2}
            cy={h - 8}
            r={6}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
    default:
      return null;
  }
}
