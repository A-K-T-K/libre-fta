---
title: Import / export
parent: Documentation
nav_order: 12
---

# Import / export

- **Open-PSA MEF** (`.xml`): the primary interchange format. Import parses the
  full MEF grammar this app supports (see [Current limitations](current-limitations.md)
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
