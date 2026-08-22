---
title: Gate types
parent: Documentation
nav_order: 5
---

# Gate types

All ten Open-PSA MEF connectives are supported:

| Gate | Inputs | Output is TRUE when… | Coherent? |
|---|---|---|---|
| **AND** | 2+ | every input is TRUE | Yes |
| **OR** | 2+ | at least one input is TRUE | Yes |
| **NOT** | exactly 1 | the input is FALSE | No |
| **NULL** | exactly 1 | pass-through — mirrors the input exactly | Yes |
| **XOR** | exactly 2 | exactly one of the two inputs is TRUE (not both) | No |
| **IFF** | exactly 2 | both inputs agree (both TRUE or both FALSE) | No |
| **NAND** | 2+ | at least one input is FALSE (negated AND) | No |
| **NOR** | 2+ | every input is FALSE (negated OR) | No |
| **ATLEAST** | k..n | at least *k* of the *n* inputs are TRUE (k-out-of-n voting) | Yes |
| **CARDINALITY** | k..m of n | between *k* and *m* (inclusive) of the *n* inputs are TRUE | Yes |

- **NOT** and **NULL** gates take exactly one input. The UI enforces this
  directly — "Add Event" is hidden once such a gate already has its one child,
  both from the context menu and from the underlying store action the keyboard
  shortcut also goes through — rather than only catching it after the fact in
  validation.
- **IFF, XOR, NAND, NOR, NOT** are *non-coherent* (non-monotonic): a gate whose
  output can become *less* likely as an input becomes *more* likely. The
  built-in engine's cut-set enumeration is a MOCUS-style algorithm that
  fundamentally assumes coherent/monotonic logic, so these gates are
  approximated as an opaque pseudo-event in the cut-set table (with a warning
  explaining this) — the top-event *probability* is still computed exactly
  either way, only the cut-set *breakdown* is approximated for the built-in
  engine. Real SCRAM CLI (BDD/ZBDD) handles non-coherent gates correctly for
  probability, but its own minimal-cut-set algorithm has the same fundamental
  limitation for these gates (see [Current limitations](current-limitations.md)).
