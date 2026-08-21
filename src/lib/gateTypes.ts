import type { GateType } from "@/types/fta";

/** Single source of truth for gate-type metadata used across the canvas,
 * context menus, tree view, and export renderers — previously duplicated
 * independently in ~6 files, which made it easy to add a new `GateType`
 * without updating every UI surface (TypeScript only caught the ones typed
 * as `Record<GateType, ...>`; a plain array/switch silently stayed stale). */
export const GATE_TYPES: GateType[] = ["and", "or", "atleast", "cardinality", "not", "xor", "iff", "nand", "nor", "null"];

export const GATE_LABELS: Record<GateType, string> = {
  and: "AND",
  or: "OR",
  atleast: "VOTE",
  cardinality: "CARDINALITY",
  not: "NOT",
  xor: "XOR",
  iff: "IFF",
  nand: "NAND",
  nor: "NOR",
  null: "NULL",
};

// Standard boolean-algebra glyphs: A·B = AND, A+B = OR, A⊕B = XOR, ¬A = NOT.
// NAND/NOR use the AND/OR glyph with an overline-style prime (no single
// Unicode overline-dot glyph renders reliably at small sizes); IFF uses the
// equivalence arrow; CARDINALITY generalizes VOTE's "≥k" to a "[min,max]"
// range shown via the gate's own badge rather than this static glyph.
export const GATE_SYMBOLS: Record<GateType, string> = {
  and: "·",
  or: "+",
  atleast: "≥k",
  cardinality: "[m,M]",
  not: "¬",
  xor: "⊕",
  iff: "⇔",
  nand: "⊼",
  nor: "⊽",
  null: "=",
};
