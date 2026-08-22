---
title: Keyboard shortcuts
parent: Documentation
nav_order: 13
---

# Keyboard shortcuts

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
