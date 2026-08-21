import { XMLParser } from "fast-xml-parser";
import type { AnalysisResults, ImportanceRow, MinimalCutSet, SolverAlgorithm } from "@/types/fta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Best-effort parser for SCRAM's XML report format (report.rng). SCRAM was
 * not available to validate against in this environment, so this is
 * defensive: unknown/missing fields degrade gracefully rather than throwing,
 * and the raw report text is always preserved by the caller for inspection.
 */
export function parseScramReport(xmlText: string, algorithm: SolverAlgorithm): AnalysisResults {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xmlText);
  const report = doc.report;
  const warnings: string[] = [];

  if (!report) {
    return {
      algorithm,
      cutSets: [],
      importance: [],
      warnings: ["Could not locate <report> root element in SCRAM output."],
      runAt: new Date().toISOString(),
    };
  }

  const results = report.results;
  const sop: XmlNode | undefined = asArray(results?.["sum-of-products"])[0];

  let topEventProbability: number | undefined;
  const cutSets: MinimalCutSet[] = [];

  if (sop) {
    const probAttr = sop["@_probability"];
    if (probAttr !== undefined) topEventProbability = Number(probAttr);

    const products = asArray(sop.product);
    let degenerateProductSkipped = false;
    let idx = 0;
    for (const p of products) {
      // A CCF group run with --ccf expands into products wrapping their
      // basic events in <ccf-event ccf-group="..." order=".." group-size="..">
      // instead of listing them as plain <basic-event> — verified against a
      // real `scram --ccf` run. Represented as one term per ccf-event
      // (it's conceptually one combined failure mode, not several
      // independent ones) rather than unpacking its members individually.
      const events: string[] = [
        ...asArray(p["basic-event"]).map((e: XmlNode) => e["@_name"]),
        ...asArray(p["not"]).map((e: XmlNode) => `NOT ${e["basic-event"]?.["@_name"] ?? "?"}`),
        ...asArray(p["ccf-event"]).map((ce: XmlNode) => {
          const members = asArray(ce["basic-event"]).map((e: XmlNode) => e["@_name"]);
          return `CCF:${ce["@_ccf-group"] ?? "?"}[${members.join("+")}]`;
        }),
      ];
      // SCRAM represents a non-coherent gate (IFF/XOR/NOT/NAND/NOR) it
      // can't reduce to a proper minimal-cut-set breakdown as a single
      // degenerate "UNITY/Base" product — an empty `<product>` with no
      // `<basic-event>` children at all, but `probability="1"
      // contribution="1"` (verified against a real `scram --bdd` run on
      // an IFF gate: `<sum-of-products … warning="The set is UNITY/Base."
      // …><product order="1" probability="1" contribution="1"/>…`, next
      // to a perfectly correct top-level `probability="0.74"` on the
      // `sum-of-products` element itself). Taking that at face value
      // produced exactly the reported bug: a "cut set" pointing at no
      // events at all, showing 100% contribution and probability 1.00 —
      // there's nothing meaningful to show as a cut set here, only an
      // explanation for why there isn't one (below), matching what the
      // built-in engine already does for the same non-coherent-gate case.
      if (events.length === 0) {
        degenerateProductSkipped = true;
        continue;
      }
      cutSets.push({
        id: `sc-${idx++}`,
        order: Number(p["@_order"] ?? events.length),
        events,
        probability: p["@_probability"] !== undefined ? Number(p["@_probability"]) : undefined,
        contribution: p["@_contribution"] !== undefined ? Number(p["@_contribution"]) : undefined,
      });
    }

    if (degenerateProductSkipped) {
      warnings.push(
        "One or more non-coherent gates (IFF/XOR/NOT/NAND/NOR) couldn't be reduced to a minimal cut-set breakdown by SCRAM — the top-event probability above is still exact, but no cut sets are shown for that part of the tree."
      );
    }

    // SCRAM reports contribution per-product directly; only derive it when absent.
    if (cutSets.some((c) => c.contribution === undefined)) {
      const sumProb = cutSets.reduce((a, c) => a + (c.probability ?? 0), 0) || 1;
      for (const c of cutSets) c.contribution ??= (c.probability ?? 0) / sumProb;
    }
  } else {
    warnings.push("No <sum-of-products> section found in SCRAM report.");
  }

  const importance: ImportanceRow[] = [];
  const importanceBlock: XmlNode | undefined = asArray(results?.importance)[0];
  if (importanceBlock) {
    for (const be of asArray(importanceBlock["basic-event"])) {
      importance.push({
        identifier: be["@_name"],
        label: be["@_name"],
        occurrences: Number(be["@_occurrence"] ?? 0),
        birnbaum: Number(be["@_MIF"] ?? 0),
        criticality: Number(be["@_CIF"] ?? 0),
        fusselVesely: Number(be["@_DIF"] ?? 0),
        raw: Number(be["@_RAW"] ?? 0),
        rrw: Number(be["@_RRW"] ?? 0),
      });
    }
  }

  // Verified against a real `scram --uncertainty` run (see serializer.ts's
  // `probabilityExpression` for the distributions that feed this):
  // <measure name="TOP"><mean value=.../><standard-deviation value=.../>
  // <quantiles number="20"><quantile number="1" value="0.05" upper-bound=.../>
  // ...<quantile number="19" value="0.95" upper-bound=.../></quantiles>...
  // </measure>, a sibling of <sum-of-products> under <results>. Quantile
  // bins are equal-probability-mass, so the bin whose cumulative `value` is
  // 0.05 has its `upper-bound` sitting at the empirical 5th percentile
  // (same for 0.95) — matching the built-in engine's own 5th/95th-percentile
  // `runMonteCarlo` (engine.ts), rather than SCRAM's `<confidence-range>`
  // (which bounds the mean estimate's precision, a different statistic).
  let uncertainty: AnalysisResults["uncertainty"];
  const measure: XmlNode | undefined = asArray(results?.measure)[0];
  if (measure?.mean?.["@_value"] !== undefined && measure?.["standard-deviation"]?.["@_value"] !== undefined) {
    const mean = Number(measure.mean["@_value"]);
    const stdDev = Number(measure["standard-deviation"]["@_value"]);
    const quantiles = asArray(measure.quantiles?.quantile);
    const lo = quantiles.find((q: XmlNode) => Math.abs(Number(q["@_value"]) - 0.05) < 1e-6);
    const hi = quantiles.find((q: XmlNode) => Math.abs(Number(q["@_value"]) - 0.95) < 1e-6);
    const ci: [number, number] =
      lo && hi
        ? [Number(lo["@_upper-bound"]), Number(hi["@_upper-bound"])]
        : [Math.max(0, mean - 1.645 * stdDev), Math.min(1, mean + 1.645 * stdDev)];
    uncertainty = { mean, stdDev, ci };
  }

  return {
    topEventProbability,
    algorithm,
    cutSets,
    importance,
    warnings,
    runAt: new Date().toISOString(),
    uncertainty,
  };
}
