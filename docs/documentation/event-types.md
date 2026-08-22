---
title: Event types
parent: Documentation
nav_order: 6
---

# Event types

| Type | Meaning |
|---|---|
| **Basic event** | A leaf failure with no further breakdown — the fundamental unit a fault tree is built from. |
| **Undeveloped event** | A leaf deliberately left unanalyzed (out of scope, or not developed further) — modeled like a basic event, drawn distinctly so it's not mistaken for a fully analyzed one. |
| **House event** | A fixed boolean condition (always TRUE or always FALSE) used to switch parts of the tree on/off — e.g. modeling a maintenance state or a boundary condition, not an actual failure probability. |
| **Conditional event** | A basic event representing a condition that must hold (rather than a component failure) — same probability model options as a basic event. |
| **Intermediate event** | A box with its own gate underneath — the standard way to name and label a sub-combination of failures partway up the tree. |
| **Transfer event** | A leaf that opens another tab/tree, letting one sub-tree be reused/reference from multiple places — see [Transfer trees](transfer-trees-multi-tab-models.md). |

- **Probability models** (basic/undeveloped/conditional events):
  - **Constant value** — a fixed probability `p` (0–1), used as-is.
  - **Exponential failure rate** — a failure rate `λ` combined with the run's
    **mission time** `t` via SCRAM's own `1 - e^(-λt)` formula, so the same
    event's effective probability scales correctly if you change the mission
    time in Run Options without editing every event by hand.
  - **House events** instead carry a fixed boolean state (TRUE/FALSE), not a
    probability model at all.
- **Uncertainty distributions**: any basic/undeveloped/conditional event's
  probability can optionally carry an uncertainty distribution (uniform,
  normal, or lognormal, matching Open-PSA MEF's own deviate parameterizations)
  sampled during Monte Carlo uncertainty analysis.
- **Shared events**: the same physical event (basic/undeveloped/house/
  conditional) can legitimately appear under more than one gate — the canvas
  draws each occurrence as its own node instance (with a small "×N" badge
  showing how many times it repeats), all sharing one identifier, and the
  serializer correctly collapses them back into one `<basic-event>` etc. on
  export.
- **Shared gates**: a gate referenced from more than one parent (legal in the
  Open-PSA MEF's DAG structure) is likewise drawn as a separate cloned subtree
  per parent — this app's canvas is a strict tree, not a DAG — while still
  collapsing back to one `<define-gate>` on export.
