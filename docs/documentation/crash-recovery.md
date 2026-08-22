---
title: Crash recovery
parent: Documentation
nav_order: 14
---

# Crash recovery

The session (every tab's nodes/edges, plus which document it's associated with)
is autosaved every 2 seconds. On launch, if a leftover autosave is found (from
a crash or an unclean close), a prompt offers **Restore** or **Discard** —
Discard actually deletes the autosaved snapshot, so it won't keep reappearing
on every subsequent launch.

The app also warns before actually losing work: closing the window with
unsaved changes prompts **Save / Don't Save / Cancel**, same as New Model.
