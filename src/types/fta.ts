// Core domain model for the fault tree editor, aligned with the
// Open-PSA Model Exchange Format (MEF) vocabulary.

export type GateType = "and" | "or" | "atleast" | "not" | "xor" | "nand" | "nor" | "iff" | "cardinality" | "null";

/** "intermediate" events are event boxes that are developed further by a
 * gate beneath them; "transfer" is a terminal leaf linking to another tab's
 * tree; the rest are ordinary terminal leaves with no children. */
export type EventKind = "basic" | "undeveloped" | "house" | "conditional" | "intermediate" | "transfer";

export const TERMINAL_EVENT_KINDS: EventKind[] = ["basic", "undeveloped", "house", "conditional", "transfer"];

export type NodeCategory = "gate" | "event" | "top";

export type DistributionKind = "uniform" | "normal" | "lognormal";

/** Parameterization mirrors Open-PSA MEF's own deviate expressions, so the
 * same model round-trips to SCRAM: uniform is `[min, max]`, normal is
 * `[mean, stddev]`, lognormal is `[median, errorFactor]`. */
export interface Distribution {
  kind: DistributionKind;
  params: number[];
}

export interface ProbabilityModel {
  /** Constant probability, e.g. 1.0e-4 */
  value?: number;
  /** Exponential failure rate (lambda), used with mission time */
  lambda?: number;
  /** House event boolean state */
  booleanState?: boolean;
  /** Optional uncertainty distribution around `value`/`lambda`, sampled
   * during Monte Carlo uncertainty analysis. Ignored otherwise. */
  distribution?: Distribution;
}

export interface FaultTreeNodeData {
  [key: string]: unknown;
  label: string;
  /** Open-PSA identifier: letters, digits, hyphen, underscore, no leading digit */
  identifier: string;
  category: NodeCategory;
  gateType?: GateType;
  /** Required only for the "atleast" / voting gate (the k in k-out-of-n) and
   * the "cardinality" gate (its minimum bound). */
  votingK?: number;
  /** Required only for the "cardinality" gate: the upper bound of active
   * inputs, alongside `votingK` as its lower bound. */
  votingMax?: number;
  eventKind?: EventKind;
  probability?: ProbabilityModel;
  description?: string;
  /** Populated after a run: this node's contribution / importance metrics */
  importance?: NodeImportance;
  /** True when this gate's subtree is collapsed into a compact badge. */
  collapsed?: boolean;
  /** Number of terminal events hidden beneath a collapsed gate. */
  collapsedLeafCount?: number;
  /** Live-computed probability of a collapsed gate's subtree. */
  collapsedProbability?: number;
  /** How many nodes in the tree share this event's identifier (only set when > 1). */
  repeatedCount?: number;
  /** True while another instance sharing this identifier is selected. */
  repeatedActive?: boolean;
}

export interface NodeImportance {
  birnbaum?: number;
  criticality?: number;
  fusselVesely?: number;
  raw?: number; // Risk Achievement Worth
  rrw?: number; // Risk Reduction Worth
}

export interface MinimalCutSet {
  id: string;
  order: number;
  events: string[]; // identifiers
  probability?: number;
  contribution?: number; // fraction of total top event probability
}

export interface ImportanceRow {
  identifier: string;
  label: string;
  occurrences: number;
  birnbaum: number;
  criticality: number;
  fusselVesely: number;
  raw: number;
  rrw: number;
}

export interface AnalysisResults {
  topEventProbability?: number;
  algorithm: SolverAlgorithm;
  cutSets: MinimalCutSet[];
  importance: ImportanceRow[];
  warnings: string[];
  runAt: string;
  wallTimeMs?: number;
  primeImplicants?: boolean;
  /** The mission time (hours) `topEventProbability` was evaluated at —
   * matters whenever any event uses a failure-rate (exponential)
   * probability rather than a time-invariant constant. */
  missionTime?: number;
  /** Monte Carlo uncertainty summary over `topEventProbability`, present
   * only when `RunOptions.uncertainty` was on for this run. */
  uncertainty?: {
    mean: number;
    stdDev: number;
    /** 90% confidence interval (5th/95th percentile). */
    ci: [number, number];
  };
}

export type SolverAlgorithm = "bdd" | "zbdd" | "mocus";

export interface RunOptions {
  algorithm: SolverAlgorithm;
  probability: boolean;
  importance: boolean;
  uncertainty: boolean;
  primeImplicants: boolean;
  numTrials: number;
  missionTime: number;
  limitOrder: number;
  cutOff: number;
}

export type CcfModel = "beta-factor" | "mgl" | "alpha-factor";

/** Common-cause failure group — a set of basic events that can fail
 * together from a shared cause, modeled per Open-PSA MEF's `<ccf-group>`.
 * `factors` holds one value for beta-factor (β), or per-level values for
 * MGL (level-2..level-N factors) / alpha-factor (level-1..level-N factors).
 * The built-in engine only evaluates beta-factor groups whose members share
 * a single immediate parent gate (engine.ts); MGL, alpha-factor, and other
 * topologies are exported to SCRAM CLI only. (`phi-factor` groups are legal
 * per Open-PSA MEF but not modeled by this app at all — imported ones are
 * skipped rather than misrepresented.) */
export interface CcfGroup {
  id: string;
  name: string;
  model: CcfModel;
  memberIdentifiers: string[];
  groupProbability: ProbabilityModel;
  factors: number[];
}

export type LintSeverity = "error" | "warning";

export interface LintIssue {
  id: string;
  severity: LintSeverity;
  message: string;
  nodeId?: string;
  /** Which tree tab `nodeId` actually lives in — validation runs across the
   * whole model (main tree + every transfer sub-tree), so the offending
   * node is frequently not on the tab the user currently has open. */
  tabId?: string;
}
