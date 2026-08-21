import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type {
  AnalysisResults,
  CcfGroup,
  Distribution,
  ImportanceRow,
  MinimalCutSet,
  RunOptions,
} from "@/types/fta";
import { AnalysisResourceLimitError } from "@/lib/analysis/resourceLimitError";

type BoolNode =
  | { kind: "event"; id: string; house: boolean }
  | { kind: "gate"; id: string; gateType: string; k: number; kMax: number; children: BoolNode[] };

function buildTree(nodes: FTANode[], edges: FTAEdge[], rootId: string): BoolNode {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }

  // `seen` is mutated in place and backtracked (add before recursing, delete
  // after) rather than cloned into a fresh Set at every recursion level —
  // the previous `new Set(seen).add(id)` copied the whole path-so-far at
  // every node, which is O(depth) work per node and O(depth^2) over a long
  // transfer-gate chain. A single shared, backtracked set does the same
  // cycle detection in O(1) per node.
  function build(id: string, seen: Set<string>): BoolNode {
    const n = byId.get(id);
    if (!n) return { kind: "event", id, house: false };

    const isBox = n.data.category === "top" || n.data.eventKind === "intermediate";
    if (isBox) {
      // Top/intermediate event boxes are transparent: their logic is defined
      // by the single gate beneath them, so pass straight through to it.
      const gateChildId = (childrenOf.get(id) ?? [])[0];
      if (gateChildId && !seen.has(gateChildId)) {
        seen.add(id);
        const result = build(gateChildId, seen);
        seen.delete(id);
        return result;
      }
      // No gate defined yet (incomplete model) - treat conservatively as never-failing.
      return { kind: "event", id, house: false };
    }
    if (n.data.category === "event") {
      return { kind: "event", id, house: n.data.eventKind === "house" };
    }
    if (seen.has(id)) {
      // circular reference guard - treat as an opaque leaf to avoid infinite recursion
      return { kind: "event", id, house: false };
    }
    seen.add(id);
    const kids = (childrenOf.get(id) ?? []).map((cid) => build(cid, seen));
    seen.delete(id);
    return {
      kind: "gate",
      id,
      gateType: n.data.gateType ?? "or",
      k: n.data.votingK ?? 1,
      kMax: n.data.votingMax ?? kids.length,
      children: kids,
    };
  }

  return build(rootId, new Set());
}

/** A leaf's probability at a given mission time — constant events (`value`)
 * are time-invariant, but exponential/failure-rate events (`lambda`) follow
 * the standard reliability CDF `P(t) = 1 - e^(-λt)`, so they need the
 * mission time to mean anything. Previously this only ever read `.value`,
 * so any event configured with a failure rate silently computed as
 * probability 0 everywhere in the built-in engine (the live collapsed-gate
 * badge, and any run when SCRAM isn't available). */
export function leafProbabilityAt(prob: FTANode["data"]["probability"], missionTime: number): number {
  if (prob?.lambda !== undefined) return 1 - Math.exp(-prob.lambda * missionTime);
  return prob?.value ?? 0;
}

function leafProbability(
  nodes: Map<string, FTANode>,
  id: string,
  house: boolean,
  overrides: Map<string, number>,
  missionTime: number
): number {
  if (overrides.has(id)) return overrides.get(id)!;
  const n = nodes.get(id);
  if (house) return n?.data.probability?.booleanState ? 1 : 0;
  return leafProbabilityAt(n?.data.probability, missionTime);
}

/** Exact-ish probability computation assuming independence between basic events. */
function computeProbability(
  node: BoolNode,
  nodesById: Map<string, FTANode>,
  overrides: Map<string, number>,
  missionTime: number
): number {
  if (node.kind === "event") {
    return leafProbability(nodesById, node.id, node.house, overrides, missionTime);
  }
  const childProbs = node.children.map((c) => computeProbability(c, nodesById, overrides, missionTime));

  switch (node.gateType) {
    case "and":
      return childProbs.reduce((a, b) => a * b, 1);
    case "or":
      return 1 - childProbs.reduce((a, b) => a * (1 - b), 1);
    case "nand":
      return 1 - childProbs.reduce((a, b) => a * b, 1);
    case "nor":
      return childProbs.reduce((a, b) => a * (1 - b), 1);
    case "not":
      return 1 - (childProbs[0] ?? 0);
    case "null":
      return childProbs[0] ?? 0;
    case "xor":
      return oddParityProbability(childProbs);
    case "iff":
      // Equivalence of the (schema-constrained) two inputs is "not xor".
      return 1 - oddParityProbability(childProbs);
    case "atleast": {
      const dist = exactCountDistribution(childProbs);
      let total = 0;
      for (let j = node.k; j < dist.length; j++) total += dist[j];
      return total;
    }
    case "cardinality": {
      const dist = exactCountDistribution(childProbs);
      let total = 0;
      const hi = Math.min(node.kMax, dist.length - 1);
      for (let j = node.k; j <= hi; j++) total += dist[j];
      return total;
    }
    default:
      return 0;
  }
}

/** Odd-parity recurrence across all children — P(an odd number are true). */
function oddParityProbability(childProbs: number[]): number {
  let pOdd = 0;
  for (const p of childProbs) pOdd = pOdd * (1 - p) + (1 - pOdd) * p;
  return pOdd;
}

/** DP over "exactly j of the children occurred", `dist[j]` = P(exactly j true). */
function exactCountDistribution(childProbs: number[]): number[] {
  let dist = [1];
  for (const p of childProbs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let j = 0; j < dist.length; j++) {
      next[j] += dist[j] * (1 - p);
      next[j + 1] += dist[j] * p;
    }
    dist = next;
  }
  return dist;
}

/** Minimal cut set enumeration for coherent gates (and/or/atleast). Non-coherent
 * subtrees (not/xor) are treated as an opaque pseudo-event, since MOCUS-style
 * cut-set expansion is not directly applicable to them. */
/** Hard ceiling on how many raw (pre-minimization) cut-set rows the
 * built-in engine will ever build in memory. Its cut-set enumeration is a
 * naive, unpruned combinatorial expansion (no limit-order/cut-off pruning
 * *during* the walk, only after — see `analyzeFaultTree`'s post-filter),
 * so a large real-world tree (hundreds of gates, "atleast"/AND-of-ORs
 * structures) can blow this up past what the JS heap can hold — observed
 * directly hanging/crashing the renderer on a ~600-gate model. Checked at
 * every combinatorial growth point (AND's cartesian product, atleast/
 * cardinality's k-combinations) so the walk bails out with a clean,
 * catchable error the moment it would exceed a safe budget, rather than
 * after already having allocated an unrecoverable amount of memory. */
const MAX_RAW_CUT_SET_ROWS = 400_000;

function checkCutSetBudget(rowCount: number, nodeCount: number): void {
  if (rowCount > MAX_RAW_CUT_SET_ROWS) {
    // `.toLocaleString()` with no explicit locale follows the system/browser
    // locale — found live during battle-testing: on an en-IN-style locale
    // this renders "4,00,000" (South Asian digit grouping) instead of the
    // expected "400,000", which reads as a typo/garbled number to most
    // users regardless of their own locale. Technical figures like this
    // stay in a fixed, predictable grouping; only human-facing dates
    // (elsewhere in the app) are left to follow the system locale.
    throw new AnalysisResourceLimitError(
      `Cut-set enumeration exceeded ${MAX_RAW_CUT_SET_ROWS.toLocaleString("en-US")} intermediate rows — this model is too combinatorially large for the built-in engine.`,
      nodeCount,
      `${rowCount.toLocaleString("en-US")}+ intermediate cut-set rows before minimization. Try SCRAM CLI instead (it uses BDDs, not raw enumeration), or raise --cut-off / lower --limit-order in Run Options.`
    );
  }
}

function enumerateCutSets(node: BoolNode, nonCoherentIds: Set<string>, nodeCount: number): string[][] {
  if (node.kind === "event") return [[node.id]];
  // NAND/NOR/IFF are inherently non-monotone (negated/equivalence logic), so
  // MOCUS-style minimal-cut-set expansion doesn't apply — treated as an
  // opaque pseudo-event, same as NOT/XOR.
  if (node.gateType === "not" || node.gateType === "xor" || node.gateType === "nand" || node.gateType === "nor" || node.gateType === "iff") {
    nonCoherentIds.add(node.id);
    return [[node.id]];
  }
  // A NULL gate is a transparent pass-through: its cut sets are exactly its
  // single child's, with no wrapping.
  if (node.gateType === "null") {
    return node.children[0] ? enumerateCutSets(node.children[0], nonCoherentIds, nodeCount) : [[node.id]];
  }
  // CARDINALITY is only coherent (monotone) when its upper bound doesn't
  // actually constrain anything — i.e. every child being true still
  // satisfies it. Otherwise more failures can un-fail the gate, which MOCUS
  // expansion can't represent, so it falls back to an opaque pseudo-event
  // like the other non-coherent connectives above.
  if (node.gateType === "cardinality" && node.kMax < node.children.length) {
    nonCoherentIds.add(node.id);
    return [[node.id]];
  }

  const childSets = node.children.map((c) => enumerateCutSets(c, nonCoherentIds, nodeCount));

  if (node.gateType === "or") {
    checkCutSetBudget(childSets.reduce((a, s) => a + s.length, 0), nodeCount);
    return minimalize(childSets.flat());
  }
  if (node.gateType === "and") {
    let combos: string[][] = [[]];
    for (const sets of childSets) {
      const next: string[][] = [];
      for (const combo of combos) {
        for (const s of sets) next.push([...combo, ...s]);
      }
      checkCutSetBudget(next.length, nodeCount);
      combos = next;
    }
    return minimalize(combos.map((c) => Array.from(new Set(c))));
  }
  if (node.gateType === "atleast" || node.gateType === "cardinality") {
    const k = node.k;
    const n = childSets.length;
    const results: string[][] = [];
    const indices = childSets.map((_, i) => i);
    const combosOfK = kCombinations(indices, k);
    checkCutSetBudget(combosOfK.length, nodeCount);
    for (const combo of combosOfK) {
      let sets: string[][] = [[]];
      for (const idx of combo) {
        const next: string[][] = [];
        for (const s of sets) {
          for (const cs of childSets[idx]) next.push([...s, ...cs]);
        }
        sets = next;
      }
      checkCutSetBudget(results.length + sets.length, nodeCount);
      results.push(...sets.map((s) => Array.from(new Set(s))));
    }
    void n;
    return minimalize(results);
  }
  return [];
}

function kCombinations<T>(arr: T[], k: number): T[][] {
  if (k > arr.length) return [];
  if (k === 0) return [[]];
  const [first, ...rest] = arr;
  const withFirst = kCombinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = kCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/** Drops duplicate and non-minimal (superset) cut sets. The naive approach —
 * compare every pair, O(n²) — is fine for small inputs but becomes the
 * dominant cost once cut-set counts climb into the tens/hundreds of
 * thousands (observed directly: this was the actual long pole on large
 * trees, well past the point where the enumeration itself had finished).
 * This instead processes candidates in ascending order of size and checks
 * each only against the `kept` (already-confirmed-minimal) list: since
 * `kept` is built in size order, a later/larger candidate can never
 * invalidate an earlier/smaller kept set, so each candidate only needs a
 * one-directional "is any kept set ⊆ me" check. For a typical fault tree,
 * the true minimal cut sets are a small fraction of the raw combinatorial
 * expansion, so `kept` stays far smaller than the full input — turning the
 * effective cost from O(n²) down to roughly O(n · kept.length) in practice,
 * instead of always paying for every pair. */
function minimalize(cutsets: string[][]): string[][] {
  const seenKeys = new Set<string>();
  const unique: string[][] = [];
  for (const c of cutsets) {
    const key = [...c].sort().join(",");
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      unique.push(c);
    }
  }
  unique.sort((a, b) => a.length - b.length);

  const kept: string[][] = [];
  const keptSets: Set<string>[] = [];
  for (const candidate of unique) {
    const candidateSet = new Set(candidate);
    let isSuperset = false;
    for (const keptSet of keptSets) {
      if (keptSet.size > candidateSet.size) continue;
      let subset = true;
      for (const x of keptSet) {
        if (!candidateSet.has(x)) {
          subset = false;
          break;
        }
      }
      if (subset) {
        isSuperset = true;
        break;
      }
    }
    if (!isSuperset) {
      kept.push(candidate);
      keptSets.push(candidateSet);
    }
  }
  return kept;
}

/** Live probability of an arbitrary gate/event (not just the TOP event) —
 * used for the collapsed-subtree badge, so it updates immediately as you
 * edit probabilities instead of requiring a full Run Analysis. */
export function computeNodeProbability(
  nodes: FTANode[],
  edges: FTAEdge[],
  rootId: string,
  missionTime = 8760
): number {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const tree = buildTree(nodes, edges, rootId);
  return computeProbability(tree, nodesById, new Map(), missionTime);
}

/** Sweeps one event's probability (or failure rate, if it's lambda-based)
 * across a range and reports how the top-event probability responds at
 * each point — reuses the same override-map mechanism `analyzeFaultTree`
 * already uses for Birnbaum importance (below), just looped across a range
 * instead of just {0, 1}. Read-only: doesn't touch cut sets or importance,
 * since this is an on-demand "what if" query, not part of the main run. */
export function sweepEventProbability(
  nodes: FTANode[],
  edges: FTAEdge[],
  rootId: string,
  eventId: string,
  range: { min: number; max: number; steps: number },
  missionTime: number
): { value: number; topEventProbability: number }[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const tree = buildTree(nodes, edges, rootId);
  const steps = Math.max(2, Math.floor(range.steps));
  const points: { value: number; topEventProbability: number }[] = [];

  for (let i = 0; i < steps; i++) {
    const value = range.min + ((range.max - range.min) * i) / (steps - 1);
    const overrides = new Map<string, number>([[eventId, value]]);
    points.push({ value, topEventProbability: computeProbability(tree, nodesById, overrides, missionTime) });
  }

  return points;
}

function sampleStandardNormal(): number {
  // Box-Muller transform.
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleDistribution(dist: Distribution): number {
  switch (dist.kind) {
    case "uniform": {
      const [min, max] = dist.params;
      return min + Math.random() * (max - min);
    }
    case "normal": {
      const [mean, stddev] = dist.params;
      return mean + sampleStandardNormal() * stddev;
    }
    case "lognormal": {
      const [median, errorFactor] = dist.params;
      // Open-PSA MEF's lognormal deviate: errorFactor is the ratio of the
      // 95th percentile to the median, so sigma = ln(EF) / 1.645 (the
      // standard normal's 95th-percentile z-score).
      const mu = Math.log(Math.max(median, 1e-300));
      const sigma = Math.log(Math.max(errorFactor, 1 + 1e-9)) / 1.645;
      return Math.exp(mu + sampleStandardNormal() * sigma);
    }
  }
}

function sampleLeafValue(prob: FTANode["data"]["probability"], missionTime: number): number {
  if (prob?.distribution) {
    const sampled = Math.max(0, sampleDistribution(prob.distribution));
    if (prob.lambda !== undefined) {
      // The distribution models uncertainty in the failure RATE, not a raw
      // probability — apply the same P(t) = 1 - e^(-λt) transform every
      // other lambda-based calculation in this file uses instead of
      // treating the sampled rate as if it were already a probability
      // (which silently produced values around ~1e-6 instead of the
      // correct ~1e-2..1e-1 range for a typical hourly rate over a
      // multi-year mission time).
      return Math.min(1, Math.max(0, 1 - Math.exp(-sampled * missionTime)));
    }
    return Math.min(1, sampled);
  }
  return leafProbabilityAt(prob, missionTime);
}

/** Monte Carlo uncertainty propagation — each trial samples every leaf's
 * distribution (falling back to its point value where none is set), then
 * evaluates the same `computeProbability` used everywhere else in this
 * file via a per-trial override map. House events are excluded since
 * they're boolean constants, not probabilities. */
export function runMonteCarlo(
  nodes: FTANode[],
  edges: FTAEdge[],
  rootId: string,
  trials: number,
  missionTime: number
): { mean: number; stdDev: number; ci: [number, number] } {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const tree = buildTree(nodes, edges, rootId);
  const leafEvents = nodes.filter(
    (n) => n.data.category === "event" && n.data.eventKind !== "intermediate" && n.data.eventKind !== "house"
  );

  const samples: number[] = [];
  for (let t = 0; t < Math.max(1, trials); t++) {
    const overrides = new Map<string, number>();
    for (const n of leafEvents) overrides.set(n.id, sampleLeafValue(n.data.probability, missionTime));
    samples.push(computeProbability(tree, nodesById, overrides, missionTime));
  }

  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);
  const percentile = (q: number) =>
    samples[Math.min(samples.length - 1, Math.max(0, Math.round(q * (samples.length - 1))))];

  return { mean, stdDev, ci: [percentile(0.05), percentile(0.95)] };
}

interface CcfInjectionPlan {
  gateId: string;
  group: CcfGroup;
  syntheticId: string;
  memberNodeIds: string[];
}

/** Which CCF groups the built-in engine can actually evaluate: beta-factor
 * model only, and only when every member shares a single immediate parent
 * gate (the common real-world case of redundant components under one
 * AND/voting gate). Anything else — MGL, or members scattered across
 * different parents — needs SCRAM CLI's real `<ccf-group>` handling; those
 * groups still export correctly (serializer.ts) but are skipped here with
 * a warning rather than silently producing a wrong number. */
function planCcfInjections(
  nodes: FTANode[],
  edges: FTAEdge[],
  ccfGroups: CcfGroup[]
): { injections: CcfInjectionPlan[]; warnings: string[] } {
  const byIdentifier = new Map(nodes.map((n) => [n.data.identifier, n]));
  const parentOf = new Map<string, string>();
  for (const e of edges) parentOf.set(e.source, e.target);

  const injections: CcfInjectionPlan[] = [];
  const warnings: string[] = [];

  for (const group of ccfGroups) {
    if (group.memberIdentifiers.length < 2) continue;

    if (group.model !== "beta-factor") {
      warnings.push(
        `CCF group "${group.name}" uses the MGL model, which the built-in engine doesn't evaluate — export to SCRAM CLI for an exact result.`
      );
      continue;
    }

    const memberNodes = group.memberIdentifiers
      .map((id) => byIdentifier.get(id))
      .filter((n): n is FTANode => Boolean(n));
    if (memberNodes.length !== group.memberIdentifiers.length) {
      warnings.push(`CCF group "${group.name}" references an event that no longer exists in the model — skipped.`);
      continue;
    }

    const parentGateIds = new Set(memberNodes.map((n) => parentOf.get(n.id)).filter(Boolean));
    if (parentGateIds.size !== 1) {
      warnings.push(
        `CCF group "${group.name}"'s members don't share a single parent gate, which the built-in engine requires — export to SCRAM CLI for an exact result.`
      );
      continue;
    }

    const [gateId] = [...parentGateIds] as [string];
    injections.push({
      gateId,
      group,
      // `nodesById`/`idToIdentifier` lookups elsewhere (McsTable, importance)
      // fall back to displaying the raw id when it doesn't resolve to a
      // real node — folding the group's name into the id means that
      // fallback still reads as something meaningful ("CCF: Pump Trains")
      // instead of an opaque internal id.
      syntheticId: `CCF: ${group.name}`,
      memberNodeIds: memberNodes.map((n) => n.id),
    });
  }

  return { injections, warnings };
}

function findGateNode(node: BoolNode, id: string): (BoolNode & { kind: "gate" }) | undefined {
  if (node.kind !== "gate") return undefined;
  if (node.id === id) return node;
  for (const c of node.children) {
    const found = findGateNode(c, id);
    if (found) return found;
  }
  return undefined;
}

/** Applies a beta-factor CCF group: injects one synthetic basic event
 * (representing "the whole group fails together") as an extra child of
 * the members' shared parent gate, and reduces each member's own
 * independent-failure contribution by (1-β) — both purely via the
 * `overrides` map already used everywhere else in this file (Birnbaum
 * importance, sensitivity sweeps), so no other function needs to know CCF
 * exists. Mutates `tree` in place (a fresh tree per analysis run, so safe)
 * and writes into `overrides`. */
function applyCcfInjections(
  tree: BoolNode,
  injections: CcfInjectionPlan[],
  nodesById: Map<string, FTANode>,
  overrides: Map<string, number>,
  missionTime: number
) {
  for (const inj of injections) {
    const target = findGateNode(tree, inj.gateId);
    if (!target) continue;
    target.children.push({ kind: "event", id: inj.syntheticId, house: false });

    const beta = inj.group.factors[0] ?? 0;
    const groupProb = leafProbabilityAt(inj.group.groupProbability, missionTime);
    overrides.set(inj.syntheticId, Math.min(1, Math.max(0, beta * groupProb)));

    for (const nodeId of inj.memberNodeIds) {
      const indep = leafProbabilityAt(nodesById.get(nodeId)?.data.probability, missionTime);
      overrides.set(nodeId, Math.min(1, Math.max(0, (1 - beta) * indep)));
    }
  }
}

export function analyzeFaultTree(
  nodes: FTANode[],
  edges: FTAEdge[],
  options: RunOptions,
  ccfGroups: CcfGroup[] = []
): AnalysisResults {
  const start = performance.now();
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const top = nodes.find((n) => n.data.category === "top");
  const warnings: string[] = [];

  if (!top) {
    return {
      algorithm: options.algorithm,
      cutSets: [],
      importance: [],
      warnings: ["No top event defined; cannot run analysis."],
      runAt: new Date().toISOString(),
    };
  }

  const tree = buildTree(nodes, edges, top.id);
  const overrides = new Map<string, number>();
  const missionTime = options.missionTime;

  const { injections, warnings: ccfWarnings } = planCcfInjections(nodes, edges, ccfGroups);
  warnings.push(...ccfWarnings);
  applyCcfInjections(tree, injections, nodesById, overrides, missionTime);

  const topEventProbability = computeProbability(tree, nodesById, overrides, missionTime);

  const nonCoherentIds = new Set<string>();
  let rawCutSets = enumerateCutSets(tree, nonCoherentIds, nodes.length);
  if (nonCoherentIds.size > 0) {
    warnings.push(
      `Non-coherent gate(s) [${[...nonCoherentIds].join(", ")}] were approximated as atomic pseudo-events in cut-set enumeration.`
    );
  }

  if (options.limitOrder > 0) {
    rawCutSets = rawCutSets.filter((c) => c.length <= options.limitOrder);
  }

  // A non-coherent gate's pseudo-event (above) is a GATE id, not a leaf
  // event id — `leafProbability` looks it up in `nodesById` expecting a
  // basic/house event's `data.probability`, which a gate node doesn't
  // have, so it silently fell back to 0. That's not just "approximated",
  // it's wrong: a cut set built around a non-coherent subtree with real
  // probability ~0.74 showed up with probability 0 (and, when it was the
  // *only* cut set, "no cut sets, but 100% at probability 1.00" after
  // upstream filtering/normalization quirks — same underlying cause as
  // the equivalent bug fixed in the real-SCRAM report parser). Fixed by
  // computing each non-coherent pseudo-event's actual probability from
  // its own subtree once up front, the same way `computeProbability`
  // already evaluates every other gate in the tree.
  const nonCoherentProbability = new Map<string, number>();
  for (const id of nonCoherentIds) {
    const gateNode = findGateNode(tree, id);
    if (gateNode) nonCoherentProbability.set(id, computeProbability(gateNode, nodesById, overrides, missionTime));
  }

  const cutSets: MinimalCutSet[] = rawCutSets
    .map((events, idx) => {
      const probability = events.reduce((acc, id) => {
        const p = nonCoherentProbability.has(id)
          ? nonCoherentProbability.get(id)!
          : leafProbability(nodesById, id, nodesById.get(id)?.data.eventKind === "house", overrides, missionTime);
        return acc * (p || 0);
      }, 1);
      return {
        id: `cs-${idx}`,
        order: events.length,
        events,
        probability,
      };
    })
    .filter((c) => c.probability >= options.cutOff)
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));

  const sumProb = cutSets.reduce((a, c) => a + (c.probability ?? 0), 0) || 1;
  for (const c of cutSets) c.contribution = (c.probability ?? 0) / sumProb;

  const importance: ImportanceRow[] = [];
  if (options.importance) {
    const basicEvents = nodes.filter(
      (n) =>
        n.data.category === "event" &&
        n.data.eventKind !== "house" &&
        n.data.eventKind !== "intermediate"
    );
    for (const be of basicEvents) {
      const occurrences = cutSets.filter((c) => c.events.includes(be.id)).length;
      if (occurrences === 0 && cutSets.length > 0) continue;

      const p = leafProbabilityAt(be.data.probability, missionTime);
      const pTop1 = computeProbability(tree, nodesById, new Map(overrides).set(be.id, 1), missionTime);
      const pTop0 = computeProbability(tree, nodesById, new Map(overrides).set(be.id, 0), missionTime);
      const birnbaum = pTop1 - pTop0;
      const criticality = topEventProbability > 0 ? (birnbaum * p) / topEventProbability : 0;
      const raw = topEventProbability > 0 ? pTop1 / topEventProbability : 0;
      const rrw = pTop0 > 0 ? topEventProbability / pTop0 : Infinity;
      const fvContribution = cutSets
        .filter((c) => c.events.includes(be.id))
        .reduce((a, c) => a + (c.contribution ?? 0), 0);

      importance.push({
        identifier: be.data.identifier,
        label: be.data.label,
        occurrences,
        birnbaum,
        criticality,
        fusselVesely: fvContribution,
        raw,
        rrw,
      });
    }
    importance.sort((a, b) => b.birnbaum - a.birnbaum);
  }

  const uncertainty = options.uncertainty
    ? runMonteCarlo(nodes, edges, top.id, options.numTrials, missionTime)
    : undefined;

  return {
    topEventProbability,
    algorithm: options.algorithm,
    cutSets,
    importance,
    warnings,
    runAt: new Date().toISOString(),
    wallTimeMs: performance.now() - start,
    primeImplicants: options.primeImplicants,
    missionTime,
    uncertainty,
  };
}
