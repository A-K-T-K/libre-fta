---
title: Transfer trees / multi-tab models
parent: Documentation
nav_order: 8
---

# Transfer trees / multi-tab models

A transfer event opens (or creates) a separate tab holding its own tree,
letting one model reference a shared sub-tree from multiple places without
redrawing it. Every tab is combined into one model at analysis/export time
(`combineTree.ts`) — validation errors inside an unopened transfer tab still
surface in the main Validation panel, not just the tab you're currently on.
