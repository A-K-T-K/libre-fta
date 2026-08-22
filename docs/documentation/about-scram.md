---
title: About SCRAM
parent: Documentation
nav_order: 2
---

# About SCRAM

[SCRAM](https://github.com/rakhimov/scram) ("Command-line Risk Analysis
Multi-tool") is an open-source (GPLv3) probabilistic risk analysis engine —
the actual solver behind this app's exact results. It performs static fault
tree analysis with common-cause failure models, exact probability calculation
via BDD/ZBDD (binary/zero-suppressed decision diagrams), importance analysis,
uncertainty analysis via Monte Carlo simulation, and can handle non-coherent
fault trees (NOT logic) — the same non-coherent-gate cases this app also
handles, with the caveats noted under [Gate types](gate-types.md). It reads and
writes the Open-PSA Model Exchange Format, the same XML dialect this app uses
for its own import/export, which is why the two interoperate losslessly.

This app treats SCRAM as the authoritative engine whenever it's available,
falling back to its own built-in JavaScript engine (an independence-based
approximation, not BDD-exact) only when SCRAM isn't. See
[SCRAM CLI integration](scram-cli-integration.md) for how the app finds/bundles
it, and [github.com/rakhimov/scram](https://github.com/rakhimov/scram) for
SCRAM's own source, documentation, and full capability list — this app only
drives a subset of what SCRAM itself can do (e.g. it doesn't expose event-tree
analysis, alignments/phases, or substitutions, all real SCRAM features outside
this app's current scope — see [Current limitations](current-limitations.md)).
