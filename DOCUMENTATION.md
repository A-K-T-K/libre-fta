---
title: Documentation
nav_order: 2
description: >-
  Full reference for LibRE FTA: every feature, gate/event types, CCF groups,
  the analysis workflow, and SCRAM CLI integration.
---

# LibRE FTA — Full Documentation

This is the detailed reference for LibRE FTA: every feature, how it works, what's
known not to work yet, and what has and hasn't been verified. For a quick start,
see [README.md](README.md). For the results of the most recent verification pass
against real benchmark models, see [CHECKS_REPORT.md](CHECKS_REPORT.md).

## Table of contents

- [What this is](#what-this-is)
- [About SCRAM](#about-scram)
- [Typical workflow](#typical-workflow)
- [Editing the tree](#editing-the-tree)
- [Gate types](#gate-types)
- [Event types](#event-types)
- [Common-cause failure (CCF) groups](#common-cause-failure-ccf-groups)
- [Transfer trees / multi-tab models](#transfer-trees--multi-tab-models)
- [Validation (linting)](#validation-linting)
- [Running analysis](#running-analysis)
- [Results](#results)
- [Import / export](#import--export)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Crash recovery](#crash-recovery)
- [SCRAM CLI integration](#scram-cli-integration)
- [Current limitations](#current-limitations)
- [What has been tested](#what-has-been-tested)
- [What is pending / not yet done](#what-is-pending--not-yet-done)
- [Architecture notes](#architecture-notes)

## What this is

LibRE FTA is a desktop fault tree analysis (FTA) editor. It's built for drawing
and editing fault trees on an interactive canvas, validating them as you go, and
computing qualitative (minimal cut sets) and quantitative (top-event probability,
importance measures) analysis results — either with a fast built-in JavaScript
engine, or by shelling out to the real [SCRAM](https://scram-pra.org/) PRA engine
when it's available, for exact BDD-based results. Models are stored in and
exchanged via the Open-PSA Model Exchange Format (MEF), the same XML format SCRAM
and several other PRA tools use, so trees built here interoperate with the wider
Open-PSA ecosystem.

## About SCRAM

[SCRAM](https://github.com/rakhimov/scram) ("Command-line Risk Analysis
Multi-tool") is an open-source (GPLv3) probabilistic risk analysis engine —
the actual solver behind this app's exact results. It performs static fault
tree analysis with common-cause failure models, exact probability calculation
via BDD/ZBDD (binary/zero-suppressed decision diagrams), importance analysis,
uncertainty analysis via Monte Carlo simulation, and can handle non-coherent
fault trees (NOT logic) — the same non-coherent-gate cases this app also
handles, with the caveats noted under [Gate types](#gate-types). It reads and
writes the Open-PSA Model Exchange Format, the same XML dialect this app uses
for its own import/export, which is why the two interoperate losslessly.

This app treats SCRAM as the authoritative engine whenever it's available,
falling back to its own built-in JavaScript engine (an independence-based
approximation, not BDD-exact) only when SCRAM isn't. See
[SCRAM CLI integration](#scram-cli-integration) for how the app finds/bundles
it, and [github.com/rakhimov/scram](https://github.com/rakhimov/scram) for
SCRAM's own source, documentation, and full capability list — this app only
drives a subset of what SCRAM itself can do (e.g. it doesn't expose event-tree
analysis, alignments/phases, or substitutions, all real SCRAM features outside
this app's current scope — see [Current limitations](#current-limitations)).

## Typical workflow

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
   together from one shared cause into a [CCF group](#common-cause-failure-ccf-groups)
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
   interval and sensitivity sweep — see [Results](#results).
8. **Save and/or export** — quick-save (Ctrl+S / Ctrl+Shift+S) back to
   whichever format you're already working in, or export the diagram as PNG/
   SVG or the report as XML/PDF for sharing outside the app — see
   [Import / export](#import--export).

## Editing the tree

- **Canvas**: pan/zoom fault-tree diagram built on `@xyflow/react`. Nodes are
  either **gates** (the boolean-logic shapes) or **events** (the boxes/circles
  hanging off them).
- **Adding structure**: right-click a gate to add a child event, or right-click
  an event box (TOP or intermediate) to add its one child gate. The bare **E**
  and **G** keyboard shortcuts do the same for whatever's currently selected.
- **Auto-layout**: recomputes the whole tree's positions bottom-up so sibling
  subtrees never overlap, using each node's actual rendered footprint (not a
  generic ELK.js layout pass) — a gate is centered over the midpoint of its
  first/last child, not the raw left/right edge of the span its children
  occupy, so a narrow intermediate-event child next to a wide leaf-event
  sibling doesn't visibly skew the gate off to one side.
- **Compact View**: shrinks node footprints and spacing across the whole canvas
  so more of a large tree fits on screen at once.
- **Undo/redo**: full undo/redo history (Ctrl+Z / Ctrl+Y), backed by `zundo`.
- **Collapsing subtrees**: any gate's subtree can be collapsed into a compact
  badge showing its own leaf-event count and probability, for focusing on one
  part of a large tree.
- **Inspector**: the right-hand panel for editing whatever's selected — label,
  Open-PSA identifier, gate type and voting parameters, probability model,
  description.
- **Tree View** (left sidebar): a searchable outline of the whole tree,
  independent of the canvas — clicking a row selects and centers that node on
  the canvas.
- **Display options** (View menu): gate label style (text/symbol/hidden — e.g.
  "AND" vs "·"), and independently toggleable label/identifier/probability text
  on nodes.

## Gate types

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
  limitation for these gates (see [Current limitations](#current-limitations)).

## Event types

| Type | Meaning |
|---|---|
| **Basic event** | A leaf failure with no further breakdown — the fundamental unit a fault tree is built from. |
| **Undeveloped event** | A leaf deliberately left unanalyzed (out of scope, or not developed further) — modeled like a basic event, drawn distinctly so it's not mistaken for a fully analyzed one. |
| **House event** | A fixed boolean condition (always TRUE or always FALSE) used to switch parts of the tree on/off — e.g. modeling a maintenance state or a boundary condition, not an actual failure probability. |
| **Conditional event** | A basic event representing a condition that must hold (rather than a component failure) — same probability model options as a basic event. |
| **Intermediate event** | A box with its own gate underneath — the standard way to name and label a sub-combination of failures partway up the tree. |
| **Transfer event** | A leaf that opens another tab/tree, letting one sub-tree be reused/reference from multiple places — see [Transfer trees](#transfer-trees--multi-tab-models). |

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

## Common-cause failure (CCF) groups

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
  [Current limitations](#current-limitations).

## Transfer trees / multi-tab models

A transfer event opens (or creates) a separate tab holding its own tree,
letting one model reference a shared sub-tree from multiple places without
redrawing it. Every tab is combined into one model at analysis/export time
(`combineTree.ts`) — validation errors inside an unopened transfer tab still
surface in the main Validation panel, not just the tab you're currently on.

## Validation (linting)

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

## Running analysis

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

## Results

- **Top event probability**, with the solving algorithm and mission time.
- **Minimal cut sets table**: sortable, filterable by event identifier, with
  order/probability/contribution columns.
- **Importance measures**: Birnbaum, criticality, Fussell-Vesely, RAW, RRW per
  basic event.
- **Sensitivity**: sweeps one chosen event's probability (or failure rate)
  across a range and plots how the top-event probability responds — a
  read-only "what if" query, independent of the main Run Analysis pipeline.
- **Uncertainty**: mean/standard deviation/confidence interval, when the
  Monte Carlo option was used.
- Export the report as **XML** or **PDF**, or the diagram itself as **PNG** or
  **SVG**.

## Import / export

- **Open-PSA MEF** (`.xml`): the primary interchange format. Import parses the
  full MEF grammar this app supports (see [Current limitations](#current-limitations)
  for what isn't supported); export serializes the combined model back to it,
  round-tripping shared events/gates, CCF groups, `<mul>` time-multiplier
  probability expressions, and canvas positions (as `fta-x`/`fta-y`
  attributes) losslessly.
- **Full-model JSON** (`.json`): this app's own lossless dump of everything it
  knows about the session — every tab, CCF groups, run options, and the last
  analysis results — for a perfect round-trip that the Open-PSA MEF format
  itself doesn't carry (e.g. results, run options).
- **Save vs. Save As**: once a document is associated with a real file path
  (either just imported, or just exported), plain **Save** (Ctrl+S for JSON,
  Ctrl+Shift+S for Open-PSA MEF) writes straight back to that same file with
  no dialog — the conventional "quick save" behavior. **Save As** (File menu
  only, no shortcut, so it's never triggered by reflex) always prompts, for
  making a copy without disturbing the file already open. Both show a "Saved"/
  "Saved as" toast confirming the write, or nothing at all if the save dialog
  was cancelled.
- Diagram export as **PNG**/**SVG**, report export as **XML**/**PDF** — Ctrl+E
  opens a picker for all four.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+R | Open Run Analysis |
| Ctrl+N | New Model (with its own Save-first prompt) |
| Ctrl+O | Open full model (.json) |
| Ctrl+Shift+O | Open Open-PSA MEF (.xml) |
| Ctrl+S | Save full model as JSON (quick-save if already tracked) |
| Ctrl+Shift+S | Save Open-PSA MEF (quick-save if already tracked) |
| Ctrl+E | Export picker (PNG / SVG / PDF) |
| Delete / Backspace | Delete the selected node(s) (with an orphan-descendant warning where relevant) |
| E | Add a basic event under the selected gate |
| G | Add a gate under the selected TOP/intermediate event box |

All of the above `preventDefault()` their browser-default meaning (new window,
open file, save page, etc.) even outside Tauri, so they're safe to use in the
plain browser-preview dev server too.

## Crash recovery

The session (every tab's nodes/edges, plus which document it's associated with)
is autosaved every 2 seconds. On launch, if a leftover autosave is found (from
a crash or an unclean close), a prompt offers **Restore** or **Discard** —
Discard actually deletes the autosaved snapshot, so it won't keep reappearing
on every subsequent launch.

The app also warns before actually losing work: closing the window with
unsaved changes prompts **Save / Don't Save / Cancel**, same as New Model.

## SCRAM CLI integration

- **Bundled — zero setup**: the desktop build ships a working SCRAM CLI (plus
  its full runtime DLL closure and RelaxNG schema files) inside the app
  itself, at `resources/scram/bin/` (declared in `tauri.conf.json`'s
  `bundle.resources`). This is checked first, before PATH or any manually
  selected location, so the real SCRAM engine is available the moment the app
  is — no download, install, or folder-picking required. Currently bundled
  for Windows only (built from a real `mingw64` SCRAM install; verified to
  run standalone with `PATH` stripped down to `C:\Windows\System32`, i.e. it
  does not depend on the host having MSYS2 or anything else installed). A
  manually selected or PATH-detected SCRAM CLI still takes priority when the
  user explicitly picks one, and the app cleanly falls back to bundled → PATH
  → built-in engine if a manual selection turns out to be broken.
- **Auto-detection**: on launch, searches `PATH` for `scram`/`scram-cli`
  (used only if the bundled binary isn't present, e.g. on a platform that
  doesn't have one bundled yet).
- **Manual "point at a folder"**: from the status bar, browse for either the
  folder holding the binary directly, or a downloaded/`git clone`d SCRAM
  source checkout — the search walks a few levels down for the built binary
  (typically `build/bin/scram`), skips VCS/IDE/build-cache directories so an
  unrelated large folder resolves quickly instead of crawling gigabytes of
  files, and is bounded by a hard 8-second wall-clock budget regardless of
  folder structure.
- **Validated, not just found**: every candidate is validated by actually
  running `scram --validate` against a small embedded model — not just
  `--version` — since a binary copied out of an incomplete build directory
  (missing its `share/scram/*.rng` schema files) responds to `--version` fine
  and then fails every real run; this is caught up front instead.
- **Self-healing the most common broken-install case**: a binary that was
  built (`cmake --build .`) but never installed (`cmake --install .`) is
  missing its paired schema files even though they still exist, untouched,
  in the source tree's own `share/` folder — SCRAM just never had them
  copied to where it looks. When validation fails with exactly that
  signature, the app automatically finds those files and copies them into
  place before retrying once, so pointing at a "just built it, didn't
  install it" checkout works without an extra manual step. Verified against
  a real local checkout in that exact state — see
  [CHECKS_REPORT.md](CHECKS_REPORT.md).
- **Resource limits**: a SCRAM report over 150 MB is refused before being read
  into memory (verified against real reports up to 2.7 GB during the
  [checks pass](CHECKS_REPORT.md)), and the built-in engine's own cut-set
  enumeration is capped at 400,000 intermediate rows — both surface a
  dedicated "too large to run safely" modal with the actual node count and
  what to try instead, rather than the renderer hanging or crashing.
- **Memory usage**: shown live in the status bar.
- **Cancellation**: the Stop button kills the actual SCRAM child process by
  PID.

## Current limitations

- **Non-coherent gates' cut-set breakdown**: as described above, both the
  built-in engine *and* real SCRAM CLI's own minimal-cut-set algorithms are
  fundamentally cut-set/coherent-logic based — a gate built entirely (or
  dominated) by IFF/XOR/NAND/NOR/NOT logic doesn't decompose into a meaningful
  minimal-cut-set list either way. The top-event *probability* is still exact
  in both engines; only the cut-set table is affected, and a warning explains
  why.
- **CCF group import**: `<ccf-group>` elements in an externally-authored
  Open-PSA MEF file don't reconstruct into a CCF group on import — members
  parse as plain independent basic events. Export is unaffected.
- **MGL/alpha-factor CCF in the built-in engine**: evaluated correctly by real
  SCRAM CLI only; the built-in engine skips them with a warning.
- **Very large models and the built-in engine**: the built-in engine is a
  JavaScript fallback for when SCRAM CLI isn't available, not a competitor to
  it — for models in the thousands-of-elements range, it will either hit its
  own safety cap or simply take too long to be practical. Real SCRAM CLI is
  the intended path for models at that scale; see the das/edf-series results
  in [CHECKS_REPORT.md](CHECKS_REPORT.md) for concrete numbers (models up to
  ~29,000 elements solved correctly by real SCRAM CLI in the same session).
- **Open-PSA MEF features out of scope**: substitutions, alignments/phases,
  and extern-function definitions (advanced MEF constructs used by a small
  minority of real-world models, mostly event-tree-adjacent) are not
  supported by the parser — a file using them will fail to import with a
  clear error rather than silently producing a wrong tree.
- **Browser-preview fallback**: outside the Tauri shell (`npm run dev`), the
  app runs entirely in a normal browser tab — no SCRAM CLI, no real file
  paths (open/save fall back to the browser's own file-picker/download
  affordances, and "Save" always behaves like "Save As" since there's no
  filesystem path to quick-save to), no window-close interception. Useful for
  UI iteration, not the intended way to run the app day to day.
- **No native undo for CCF group edits**: CCF group add/edit/remove currently
  isn't part of the canvas's undo/redo history (unlike node/edge edits).

## What has been tested

See [CHECKS_REPORT.md](CHECKS_REPORT.md) for the full, detailed results of the
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

## What is pending / not yet done

- **Bundled SCRAM CLI is Windows-only for now** — macOS/Linux builds still
  rely on PATH auto-detection or manual folder selection until an equivalent
  binary is built and bundled for those platforms.
- **CCF group import** from external Open-PSA MEF files (see limitations).
- **CCF group edits are outside undo/redo history**.
- Non-coherent-gate minimal-cut-set decomposition is an inherent algorithmic
  gap in both engines, not something planned to be "fixed" per se — the right
  framing is that the top-event probability is always trustworthy, the
  cut-set table for such gates is not, and this is now clearly communicated in
  the UI rather than silently wrong.
- The full 81-model SCRAM benchmark suite was not exhaustively run in the most
  recent checks pass — 21 representative models were, spanning the full size
  range from tiny to ~29,000 elements; see CHECKS_REPORT.md for exactly which
  ones and why the remainder were out of scope for that pass.
- No automated test suite (unit/integration tests) exists yet — verification
  to date has been live, manual (scripted-but-interactive) testing against a
  running instance of the app plus real SCRAM CLI, not a CI-run test suite.

## Architecture notes

See the [README](README.md#layout) for the source layout. A few notable design
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
