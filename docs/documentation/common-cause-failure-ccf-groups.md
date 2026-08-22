---
title: Common-cause failure (CCF) groups
parent: Documentation
nav_order: 7
---

# Common-cause failure (CCF) groups

A CCF group models a set of basic events that can fail together from a shared
cause. Manage them from the CCF panel (left sidebar).

- **Beta-factor model**: fully supported by both the built-in engine (when
  every member shares one immediate parent gate) and real SCRAM CLI. One
  factor `β` (0–1) represents the fraction of the group's probability
  attributable to a shared cause. The built-in engine implements this
  directly: it injects one synthetic "common cause" basic event as an extra
  child of the members' shared parent gate with probability `β × p_group`,
  and reduces each member's own *independent* failure contribution to
  `(1 − β) × p_member`, so the group's total (shared + independent)
  probability is preserved rather than double-counted.
- **MGL (multiple Greek letter) and alpha-factor models**: export correctly
  to Open-PSA MEF's `<ccf-group>` and are evaluated correctly by real SCRAM
  CLI (MGL uses one factor per group-failure level — e.g. β, γ, δ for a
  3-level group; alpha-factor parameterizes by failure-combination
  probability directly), but the built-in engine does not attempt to
  evaluate either — a warning is shown instead, pointing at SCRAM CLI for an
  exact result.
- **Importing** a `<ccf-group>` from an externally-authored Open-PSA MEF file
  is not supported — its members parse as ordinary independent basic events.
  Groups created in-app export correctly; this is a one-directional gap. See
  [Current limitations](current-limitations.md).
