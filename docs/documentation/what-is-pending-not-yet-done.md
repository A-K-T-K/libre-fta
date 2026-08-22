---
title: What is pending / not yet done
parent: Documentation
nav_order: 18
---

# What is pending / not yet done

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
  range from tiny to ~29,000 elements; see [checks-report.md](../checks-report.md) for exactly which
  ones and why the remainder were out of scope for that pass.
- No automated test suite (unit/integration tests) exists yet — verification
  to date has been live, manual (scripted-but-interactive) testing against a
  running instance of the app plus real SCRAM CLI, not a CI-run test suite.
