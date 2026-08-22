---
title: Documentation
nav_order: 2
has_children: true
description: >-
  Full reference for LibRE FTA, the free open-source fault tree analysis (FTA)
  editor and GUI for the SCRAM PRA engine: gate/event types, CCF groups,
  the analysis workflow, Open-PSA MEF import/export, and SCRAM CLI integration.
keywords: >-
  fault tree analysis, FTA software, SCRAM GUI, SCRAM front-end, probabilistic
  risk assessment, PRA software, Open-PSA MEF, minimal cut sets, CCF groups,
  reliability engineering, BDD ZBDD analysis, importance measures
---

# LibRE FTA — Full Documentation

This is the detailed reference for **LibRE FTA**, the free open-source fault
tree analysis (FTA) editor and graphical **GUI for the [SCRAM](https://scram-pra.org/)**
probabilistic risk assessment (PRA) engine: every feature, how it works,
what's known not to work yet, and what has and hasn't been verified. For a
quick start, see [README.md](../README.md). For the results of the most recent
verification pass against real benchmark models, see [CHECKS_REPORT.md](checks-report.md).

Each topic below is its own page — the same list also appears as sub-items
under **Documentation** in the sidebar on the built site.

## Contents

- [What this is](documentation/what-this-is.md)
- [About SCRAM](documentation/about-scram.md)
- [Typical workflow](documentation/typical-workflow.md)
- [Editing the tree](documentation/editing-the-tree.md)
- [Gate types](documentation/gate-types.md)
- [Event types](documentation/event-types.md)
- [Common-cause failure (CCF) groups](documentation/common-cause-failure-ccf-groups.md)
- [Transfer trees / multi-tab models](documentation/transfer-trees-multi-tab-models.md)
- [Validation (linting)](documentation/validation-linting.md)
- [Running analysis](documentation/running-analysis.md)
- [Results](documentation/results.md)
- [Import / export](documentation/import-export.md)
- [Keyboard shortcuts](documentation/keyboard-shortcuts.md)
- [Crash recovery](documentation/crash-recovery.md)
- [SCRAM CLI integration](documentation/scram-cli-integration.md)
- [Current limitations](documentation/current-limitations.md)
- [What has been tested](documentation/what-has-been-tested.md)
- [What is pending / not yet done](documentation/what-is-pending-not-yet-done.md)
- [Architecture notes](documentation/architecture-notes.md)

<!--
  Just the Docs note: `has_children: true` above is what makes this page a
  parent with an expandable arrow in the left sidebar, and each child page's
  own `parent: Documentation` + `nav_order` (in documentation/*.md) is what
  makes it appear nested underneath as its own clickable sidebar item — this
  is the actual fix for wanting sections in the left nav, since (as covered
  earlier) no in-page TOC syntax can populate that sidebar; only page-level
  front matter can. The "Contents" list above is redundant with the sidebar
  once the site is built, but is kept so this page (and GitHub's raw preview
  of it) is still useful/navigable on its own.
-->

---

<p align="center"><sub>
LibRE FTA documentation — SCRAM GUI reference · fault tree analysis (FTA) editor ·
Open-PSA MEF gate and event types · CCF group modeling · minimal cut sets and
importance measures · probabilistic risk assessment (PRA) workflow.
</sub></p>
