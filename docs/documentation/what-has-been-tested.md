---
title: What has been tested
parent: Documentation
nav_order: 17
---

# What has been tested

See [CHECKS_REPORT.md](../checks-report.md) for the full, detailed results of the
most recent verification pass — 21 real SCRAM benchmark models spanning tiny to
~29,000-element trees, all via real SCRAM CLI, with parse/lint/round-trip/
built-in-engine/SCRAM-CLI coverage and cross-checked numeric results. Summary:

- Import/export round-trip fidelity (Open-PSA MEF and full-model JSON) across
  every tested model, with zero node-count drift.
- Real SCRAM CLI integration end-to-end: binary detection/validation, running,
  cancellation, report parsing, and the resource-limit guards, including
  against multi-gigabyte real reports.
- The built-in engine's correctness against real SCRAM CLI's numbers on models
  small enough for both to run (they agree, modulo the built-in engine's
  independence-assumption approximation vs. SCRAM's exact BDD result).
- Non-coherent gate probability (the specific bug fixed this pass) in both
  engines, plus a from-scratch check that mixing a non-coherent gate under a
  coherent one doesn't silently zero out its contribution.
- CCF groups (beta-factor, alpha-factor), shared events, shared gates,
  transfer trees, cyclic-reference detection.
- UI: import/export dialogs, Save/Save As split with visual feedback, the New
  Model and close-window confirmation flows, all keyboard shortcuts, the
  native-context-menu suppression, the single-input-gate connection guard,
  Stop-button cancellation of both engines, the memory usage display, and the
  out-of-memory resource-limit modal.
- Edge-routing symmetry (a rendering-correctness bug, not an analysis one) for
  mixed sibling node types under one gate.
