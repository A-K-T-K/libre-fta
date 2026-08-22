---
title: What this is
parent: Documentation
nav_order: 1
---

# What this is

LibRE FTA is a desktop fault tree analysis (FTA) editor. It's built for drawing
and editing fault trees on an interactive canvas, validating them as you go, and
computing qualitative (minimal cut sets) and quantitative (top-event probability,
importance measures) analysis results — either with a fast built-in JavaScript
engine, or by shelling out to the real [SCRAM](https://scram-pra.org/) PRA engine
when it's available, for exact BDD-based results. Models are stored in and
exchanged via the Open-PSA Model Exchange Format (MEF), the same XML format SCRAM
and several other PRA tools use, so trees built here interoperate with the wider
Open-PSA ecosystem. In short: this page documents LibRE FTA as a **SCRAM GUI** —
a visual front-end for SCRAM's command-line PRA engine, not a replacement for it.
