---
title: SCRAM CLI integration
parent: Documentation
nav_order: 15
---

# SCRAM CLI integration

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
  [CHECKS_REPORT.md](../checks-report.md).
- **Resource limits**: a SCRAM report over 150 MB is refused before being read
  into memory (verified against real reports up to 2.7 GB during the
  [checks pass](../checks-report.md)), and the built-in engine's own cut-set
  enumeration is capped at 400,000 intermediate rows — both surface a
  dedicated "too large to run safely" modal with the actual node count and
  what to try instead, rather than the renderer hanging or crashing.
- **Memory usage**: shown live in the status bar.
- **Cancellation**: the Stop button kills the actual SCRAM child process by
  PID.
