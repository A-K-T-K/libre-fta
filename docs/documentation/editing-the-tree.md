---
title: Editing the tree
parent: Documentation
nav_order: 4
---

# Editing the tree

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
