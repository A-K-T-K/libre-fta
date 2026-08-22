---
title: Typical workflow
parent: Documentation
nav_order: 3
---

# Typical workflow

1. **Start a model** — File → New, or import an existing Open-PSA MEF (`.xml`)
   or full-model JSON (`.json`) file.
2. **Draw the tree** — right-click a gate to add a child event, or right-click
   an event box to add its child gate (or use the **E**/**G** keyboard
   shortcuts on whatever's selected). Use Auto-layout to keep it tidy as it
   grows.
3. **Set probabilities** — select each basic/undeveloped/conditional event in
   the Inspector and give it a probability model (constant value, or an
   exponential failure rate with mission time). Add an uncertainty
   distribution too, if you plan to run Monte Carlo uncertainty analysis.
4. **Model shared causes**, if relevant — group basic events that can fail
   together from one shared cause into a [CCF group](common-cause-failure-ccf-groups.md)
   from the CCF panel.
5. **Check Validation** (left sidebar) — fix anything flagged (missing/
   duplicate TOP event, bad identifiers, gate arity violations, cycles) before
   running; SCRAM would reject the same issues at analysis time, so this
   catches them earlier with better context.
6. **Run Analysis** (Ctrl+R) — pick an algorithm (BDD/ZBDD/MOCUS, meaningful
   only when SCRAM CLI is available), toggle probability/importance/
   uncertainty/prime-implicants, set limit-order/cut-off/mission-time, and run.
   The status bar shows whether the real SCRAM CLI or the built-in fallback
   engine actually solved it.
7. **Read the results** — top-event probability, the minimal cut-set table,
   importance measures, and (if requested) the uncertainty confidence
   interval and sensitivity sweep — see [Results](results.md).
8. **Save and/or export** — quick-save (Ctrl+S / Ctrl+Shift+S) back to
   whichever format you're already working in, or export the diagram as PNG/
   SVG or the report as XML/PDF for sharing outside the app — see
   [Import / export](import-export.md).
