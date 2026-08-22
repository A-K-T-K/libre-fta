---
title: Validation (linting)
parent: Documentation
nav_order: 9
---

# Validation (linting)

The Validation panel runs continuously (debounced) against the whole combined
model — every tab, not just the active one — and flags:

- Missing or duplicate TOP event, a TOP event feeding into another gate.
- Invalid or duplicate Open-PSA identifiers. Basic/undeveloped/house/
  conditional events may legitimately share an identifier (that's how a
  shared event is represented); gates and intermediate events may too, but
  **only** when every node sharing that identifier is an exact structural
  clone of the others (the shared-gate case above) — a genuine naming
  collision between two different gates is still caught, verified via a
  structural-signature comparison rather than a blanket allow-list.
- Gate arity violations mirroring SCRAM's own connective rules exactly (NOT/
  NULL need exactly one input, XOR/IFF need exactly two, ATLEAST/CARDINALITY
  voting parameters need to make sense relative to the child count, and so on)
  — a tree that violates these isn't just stylistically off, SCRAM CLI would
  flat-out reject it, so this is caught before you ever hit Run.
- Cyclic gate references.
