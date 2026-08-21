---
title: Checks Report
nav_order: 3
description: >-
  Results of the most recent verification pass against real SCRAM benchmark
  models — what was tested, what was found and fixed, what's still pending.
---

# LibRE FTA — Checks Report

**Date:** 2026-08-20 / 2026-08-21
**Scope:** UI, built-in analysis engine, and real SCRAM CLI integration, exercised against 21 real-world benchmark Open-PSA MEF fault trees (SCRAM's own published benchmark suite — the Aralia, Baobab, CEA9601, Chinese, and das/edf series) plus targeted edge-case scenarios, across two passes.

## 2026-08-21 follow-up: SCRAM folder auto-detection

Reported as unreliable for "point at a downloaded/cloned SCRAM repo and it just
works". Investigated against a real local SCRAM checkout
(`C:\Users\AKTK\Desktop\scram`, built but never `cmake --install`ed — the single
most common way to end up with a broken SCRAM binary) and found two real,
independent problems, both fixed in [src/lib/scram/runner.ts](src/lib/scram/runner.ts):

1. **The most common "plug and play" failure mode wasn't self-healing.** SCRAM
   resolves its own RelaxNG schema files relative to the *binary's own*
   install layout (`<install_dir>/share/scram/*.rng`). Someone who clones the
   repo and runs `cmake --build .` without the separate `--install` step gets
   a perfectly good binary with no matching `share/scram/` — the schema files
   still exist, untouched, at `<repo-root>/share/*.rng`, just never copied to
   where the binary looks for them. Confirmed live: the binary responded to
   `--version` fine and then failed every real run with `xmlRelaxNGParse:
   could not load .../input.rng`. **Fixed**: when validation fails with
   exactly this signature, the app now searches upward from the binary for a
   sibling `share/*.rng` (the source-tree layout) and copies the schema files
   into the exact spot SCRAM expects before retrying validation once — verified
   live: after the fix, the same binary got past schema loading entirely
   (confirmed by the error changing to an unrelated `libxml2:
   BCryptGenRandom failed` — a genuine local libxml2/DLL version mismatch on
   this specific build, outside what a schema-file copy could or should fix).
2. **The folder search itself could be extremely slow on an unrelated large
   folder.** `SKIP_DIR_NAMES` only excluded VCS/IDE directories — pointing
   the picker at this app's own project directory (which has a 7 GB, 1,650-
   subdirectory Rust `target/` build cache) took **6.6 seconds** to correctly
   conclude "not found". **Fixed**: the skip list now also excludes `target`,
   `dist`, `out`, `_deps`, and the other common language/build-tool
   intermediate-output directories that would never contain a SCRAM binary;
   sibling directories are now scanned in parallel instead of one at a time;
   and a hard 8-second wall-clock budget bounds the *whole* search
   regardless of folder structure, so pointing this at literally any folder
   can no longer make the UI wait indefinitely. Re-measured after the fix:
   this app's own project directory now resolves in **108 ms** (was 6.6 s);
   a real SCRAM checkout in **318 ms**; and a genuinely working install
   (`C:\msys64\mingw64`) is still found correctly, in 2.3 s.

Verified end-to-end after both fixes: `detectScramBinary()` (PATH
auto-detection, a separate Rust code path, unaffected by either change) still
finds the working mingw64 install, and a full BSCU.xml analysis through it
still reproduces the exact expected `0.112409`. `tsc --noEmit` and
`npm run build` both pass clean.

## Summary

- **2 real bugs found and fixed** during this pass (see below).
- **0 crashes, 0 data-loss, 0 round-trip corruption** across every model successfully tested — every parse → serialize → re-parse round-trip preserved the exact node count, and every model passed lint with zero errors.
- The existing resource-limit safety guards (cut-set budget cap, SCRAM-report-size cap, worker cancellation) **fired correctly under genuine real-world load** — not just synthetic tests — confirming they hold up against actual large industrial benchmark models, including two SCRAM reports that would have been **2.7 GB and 1.4 GB** had the app tried to load them.
- One test-infrastructure-only issue was found and is **not an app bug** (an abandoned, uncancelled analysis in an automated test harness destabilized the browser devtools connection — the real in-app Stop button, exercised separately, was already verified earlier this session to correctly cancel a running analysis).

## Bugs found and fixed this session

### 1. IFF (and other non-coherent gate) probability shown wrong in two places

Found by direct user report ("no cut set but the table shows probability 1.00×10⁰"), confirmed and traced to two independent root causes:

- **Real SCRAM CLI path** ([src/lib/scram/reportParser.ts](src/lib/scram/reportParser.ts)): SCRAM represents a non-coherent gate (IFF/XOR/NOT/NAND/NOR) it can't reduce to a real minimal-cut-set breakdown as a degenerate "UNITY/Base" product — a `<product>` with **zero** `<basic-event>` children but `probability="1" contribution="1"`. Verified against a real `scram --bdd` run on an IFF gate. The parser was turning that into a fake cut-set row with 100% contribution. **Fixed**: filtered out, with a clear warning explaining why no cut sets are shown (the top-event probability itself was always correct).
- **Built-in engine** ([src/lib/analysis/engine.ts](src/lib/analysis/engine.ts)): a non-coherent gate's pseudo-cutset-event probability was computed via a leaf-event lookup, which silently returned 0 for a gate id (gates have no `data.probability`). Verified live with a mixed tree (`OR(A, IFF(E1,E2))`): the IFF branch showed `probability: 0` instead of the correct `0.74`, making it look irrelevant when it was actually the dominant contributor (93.7%). **Fixed**: each non-coherent gate's real subtree probability is now computed once up front and used correctly.

### 2. Locale-dependent number formatting in resource-limit messages

Found live during this checks pass: the built-in engine's cut-set-budget error message rendered as `"exceeded 4,00,000 intermediate rows"` (South Asian digit grouping) instead of `"400,000"`, because `.toLocaleString()` was called with no explicit locale and picked up the runtime's locale. **Fixed** in [engine.ts](src/lib/analysis/engine.ts) and [ResourceLimitDialog.tsx](src/components/ResourceLimitDialog.tsx) — technical figures like this now always render in a fixed `en-US` grouping regardless of system locale (human-facing dates elsewhere in the app are deliberately left locale-sensitive, which is expected/correct for dates).

## Benchmark results

All models: parsed successfully, passed lint with **zero errors**, and round-tripped (export → re-import) with **zero node-count drift**.

| Model | Elements | Built-in engine | Real SCRAM CLI (top-event probability) |
|---|---:|---|---|
| baobab1.xml | 1,049 | cut-set budget cap (correct) | `0.000101708` |
| baobab2.xml | 677 | not run (large-model spot check) | `0.000713018` |
| baobab3.xml | 3,011 | cut-set budget cap (correct) | `0.00224117` |
| cea9601.xml | 3,785 | not run (large-model spot check) | report was 2.7 GB — refused by the size guard (correct) |
| chinese.xml | 131 | cut-set budget cap (correct) | `0.00117058` |
| das9201.xml | 549 | timed out at 15s cap, cancelled cleanly | `0.0134237` |
| das9202.xml | 256 | cut-set budget cap (correct) | `0.0101154` |
| das9203.xml | 151 | cut-set budget cap (correct) | `0.0013488` |
| das9204.xml | 146 | cut-set budget cap (correct) | `2.16942e-11` |
| das9205.xml | 99 | `1.6142e-8` | `1.38408e-8` (agrees to the expected approximation error — built-in engine is independence-based, SCRAM's BDD is exact) |
| das9206.xml | 471 | timed out at 15s cap, cancelled cleanly | `0.229687` |
| das9207.xml | 3,539 | timed out at 15s cap, cancelled cleanly | `0.346696` |
| das9208.xml | 1,862 | timed out at 15s cap, cancelled cleanly | `0.0130179` |
| das9209.xml | 256 | cut-set budget cap (correct) | `1.058e-13` |
| das9601.xml | 16,436 | timed out at 15s cap, cancelled cleanly | `0.0042344` |
| das9701.xml | ~4,986 | **not completed** — see "Known limitation" below | not completed |
| edf9201.xml | 2,658 | cut-set budget cap (correct) | `0.324591` |
| edf9202.xml | 11,918 | timed out at 15s cap, cancelled cleanly | `0.781302` |
| edf9203.xml | 12,760 | timed out at 15s cap, cancelled cleanly | report was 1.4 GB — refused by the size guard (correct) |
| edf9204.xml | 29,310 | timed out at 15s cap, cancelled cleanly | report was 1.3 GB — refused by the size guard (correct) |
| edf9205.xml | 2,101 | timed out at 15s cap, cancelled cleanly | `0.209351` |

("Timed out at 15s cap, cancelled cleanly" was this test harness's own conservative budget for the built-in engine on large models, not a hang — the harness called the same worker-cancellation API the real Stop button uses. In the real app, the built-in engine is only ever the *fallback* when SCRAM CLI isn't available; every model above that has a SCRAM number was actually solved by the real engine.)

## Known limitation (not a bug): das9701.xml

`das9701.xml` (~5,000 elements, 20,571-line source file — roughly 6× the size of CEA9601) did not complete within this test harness's time budget. Investigation confirmed real SCRAM CLI process CPU usage was climbing the whole time (i.e., it was genuinely computing, not hung), so this is a scale/performance characteristic of a very large model, not a correctness bug. Recommendation for models at this scale: raise `--cut-off` or lower `--limit-order` in Run Options before running, same as the app's own resource-limit modal already suggests.

A first attempt to batch-test this file caused the browser devtools connection used by this *test harness* to become unresponsive, because the harness abandoned the in-flight analysis on its own timeout without cancelling it — unlike the real Stop button, which was separately verified earlier this session to correctly call `cancel_scram`/terminate the analysis worker. This was a test-harness gap (now fixed: the harness cancels on timeout, same as the UI does), not an application bug.

## UI verification

Alongside the model sweep above, the following were verified live against the running app this session (see prior conversation history for full detail):

- Import (Open-PSA MEF and full-model JSON), Export, and the new Save/Save As split (quick-save writes to a known path with no dialog; Save As always prompts) — end-to-end, including the visual "Saved"/"Saved as" toast feedback added in this pass.
- New Model confirmation dialog with its Save option, closing correctly after "Start New Model".
- Close-window "unsaved changes" warning (Save / Don't Save / Cancel).
- Keyboard shortcuts: Ctrl+N, Ctrl+O, Ctrl+Shift+O, Ctrl+S, Ctrl+Shift+S, Ctrl+E, plus regression-checked the pre-existing Ctrl+Z/Y/R and bare E/G shortcuts for no conflicts.
- Native browser/webview right-click context menu suppressed everywhere, without breaking the app's own custom node context menus.
- Single-input gate (NOT/NULL) connection guard, at both the UI and store level.
- Edge-routing symmetry fix (a box event's bordered wrapper was silently offsetting its connector by its own border width) — verified via exact rendered SVG path coordinates.
- Memory usage display, Stop button (verified against both a synthetic long-running process and the real cancel-during-CEA9601 case above), and the out-of-memory resource-limit modal.
- A full BSCU.xml import → real SCRAM CLI run → results render, immediately after this entire checks pass, reproducing the exact expected probability (`0.112409`) with no regressions.

## Cleanup performed as part of this pass

- Removed stray debug artifacts from the project root: two stale `*.log` files, two old diagnostic screenshots, and a mangled-filename scratch XML file left over from earlier debugging.
- Removed the temporary `playwright-core` dependency and all `.snap-*` test scripts used for live verification throughout this session — none of this tooling is part of the shipped app.
- Confirmed a clean `npx tsc -b --noEmit` and `npm run build` after every change in this pass.
