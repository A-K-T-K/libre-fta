---
title: Running analysis
parent: Documentation
nav_order: 10
---

# Running analysis

Open with the **Run Analysis** button/dialog (Ctrl+R). Options:

- **Algorithm**: BDD, ZBDD, or MOCUS (only meaningful when SCRAM CLI is
  available — the built-in engine always uses the same enumeration approach
  regardless of which is selected).
- **Probability / Importance analysis** toggles.
- **Uncertainty (Monte Carlo)**: samples every leaf's distribution (or its
  point value where none is set) across a configurable number of trials,
  reporting a mean/standard-deviation/90% confidence interval on the top-event
  probability — computed by both the built-in engine and (parsed from) real
  SCRAM CLI's own `--uncertainty` output.
- **Prime implicants**, **limit order** (max cut-set size), **cut-off**
  (minimum cut-set probability to keep), **mission time**.
- **Stop button**: appears while a run is in progress. Cancels a real SCRAM CLI
  process via its PID, or terminates the built-in engine's Web Worker —
  verified to actually interrupt a long-running analysis, not just hide the
  "running" indicator.

Whichever engine actually ran is shown in the status bar and the results panel.
