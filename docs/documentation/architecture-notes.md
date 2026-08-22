---
title: Architecture notes
parent: Documentation
nav_order: 19
---

# Architecture notes

See the [README](../../README.md#layout) for the source layout. A few notable design
choices, if you're extending this:

- The built-in analysis engine runs in a **Web Worker**
  (`src/lib/analysis/engineWorkerClient.ts`), not the main thread — a large
  model's cut-set enumeration is a synchronous, CPU-bound computation that
  would otherwise freeze the whole UI (including the Stop button meant to
  cancel it).
- `documentName`/`documentKind`/`documentPath`/`dirty` in the Zustand store
  track "what file is this, and does it match what's on disk" — `dirty` is
  set **explicitly** at every real content-editing store action, not inferred
  from a generic "did the model change" watcher (that was tried first and
  doesn't work: React Flow's own internal node-dimension-measurement and
  click-to-select events change the `nodes` array's reference without being a
  real edit).
- Every native OS dialog (open/save file, SCRAM binary picker) and the Tauri
  window-close interception require explicit capability grants in
  `src-tauri/capabilities/default.json` — a command that compiles fine but
  silently fails at runtime with a permission error is usually a missing
  entry there.

---

<p align="center"><sub>
LibRE FTA documentation — SCRAM GUI reference · fault tree analysis (FTA) editor ·
Open-PSA MEF gate and event types · CCF group modeling · minimal cut sets and
importance measures · probabilistic risk assessment (PRA) workflow.
</sub></p>
