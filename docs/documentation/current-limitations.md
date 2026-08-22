---
title: Current limitations
parent: Documentation
nav_order: 16
---

# Current limitations

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
  in [CHECKS_REPORT.md](../checks-report.md) for concrete numbers (models up to
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
