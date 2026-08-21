import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { CcfGroup, LintIssue } from "@/types/fta";

const VALID_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Basic/undeveloped/house/conditional events may legitimately share an
 * identifier — that's how Open-PSA MEF represents the same physical event
 * referenced under more than one gate (a shared/common-cause event), and
 * the canvas has first-class support for it (repeated-event badges). */
const SHARE_SAFE_KINDS = new Set(["basic", "undeveloped", "house", "conditional"]);

/** Structural signature of the subtree rooted at `nodeId`, built from
 * `identifier`s and gate shapes rather than internal React-Flow node ids —
 * two nodes get the same signature exactly when they'd serialize to the
 * same Open-PSA MEF element. Used to tell a *legitimate* duplicate gate/
 * intermediate-event identifier (a gate referenced from more than one
 * parent — e.g. `module_detection.xml`'s `g5`, under both `g2` and `g3` —
 * which `parser.ts`'s `duplicateSharedGateSubtrees` represents on canvas as
 * separate box+gate node pairs that intentionally share one identifier so
 * they still export as a single `<define-gate>`) apart from a real modeling
 * error (two unrelated intermediate events a user happened to name the
 * same). Memoized and cycle-guarded since the same subtree can be reached
 * from many duplicate-identifier groups in one lint pass. */
function structuralSignature(
  nodeId: string,
  byId: Map<string, FTANode>,
  childrenOf: Map<string, string[]>,
  cache: Map<string, string>,
  stack: Set<string>
): string {
  const cached = cache.get(nodeId);
  if (cached !== undefined) return cached;
  if (stack.has(nodeId)) return "~cycle~"; // guarded elsewhere too, but never loop here regardless
  const n = byId.get(nodeId);
  if (!n) return "~missing~";

  stack.add(nodeId);
  let sig: string;
  if (n.data.category === "gate" || n.data.eventKind === "intermediate" || n.data.category === "top") {
    const kids = (childrenOf.get(nodeId) ?? [])
      .map((cid) => structuralSignature(cid, byId, childrenOf, cache, stack))
      .sort();
    const shape =
      n.data.category === "gate" ? `${n.data.gateType ?? "or"}:${n.data.votingK ?? ""}:${n.data.votingMax ?? ""}` : "box";
    sig = `${shape}[${kids.join(",")}]`;
  } else {
    // Leaf event: identified purely by its identifier, matching this app's
    // existing rule (above) that same-identifier leaf events are always
    // the same referenced entity, whatever probability data each copy on
    // canvas happens to carry.
    sig = `leaf:${n.data.identifier}`;
  }
  stack.delete(nodeId);
  cache.set(nodeId, sig);
  return sig;
}

export function runLint(nodes: FTANode[], edges: FTAEdge[], ccfGroups: CcfGroup[] = []): LintIssue[] {
  const issues: LintIssue[] = [];
  let seq = 0;
  const push = (severity: LintIssue["severity"], message: string, nodeId?: string) =>
    issues.push({ id: `lint-${seq++}`, severity, message, nodeId });

  const childrenOf = new Map<string, string[]>(); // gate id -> child node ids (edge.source where target=gate)
  const parentsOf = new Map<string, string[]>(); // node id -> parent gate ids (edge.target where source=node)

  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
    if (!parentsOf.has(e.source)) parentsOf.set(e.source, []);
    parentsOf.get(e.source)!.push(e.target);
  }

  const topNodes = nodes.filter((n) => n.data.category === "top");
  if (topNodes.length === 0) {
    push("error", "No top event is defined.");
  } else if (topNodes.length > 1) {
    push("error", `Multiple top events defined: ${topNodes.map((n) => n.data.identifier).join(", ")}.`);
  }
  for (const top of topNodes) {
    if ((parentsOf.get(top.id) ?? []).length > 0) {
      push("error", `Top event "${top.data.identifier}" cannot feed into another gate.`, top.id);
    }
  }

  // Identifier validation + duplicate detection
  const seen = new Map<string, string[]>();
  for (const n of nodes) {
    const id = n.data.identifier?.trim() ?? "";
    if (!id || !VALID_IDENTIFIER.test(id)) {
      push("error", `"${n.data.label}" has an invalid Open-PSA identifier: "${id}".`, n.id);
    }
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id)!.push(n.id);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const signatureCache = new Map<string, string>();
  for (const [id, ids] of seen) {
    if (ids.length <= 1) continue;
    const allLeafShareSafe = ids.every((nid) => {
      const n = byId.get(nid);
      return n?.data.category === "event" && SHARE_SAFE_KINDS.has(n.data.eventKind ?? "");
    });
    // A gate/intermediate-event identifier can legitimately repeat too —
    // see `structuralSignature`'s doc comment — but only when every node
    // sharing it is an exact structural duplicate of the others (the same
    // gate, referenced from more than one parent). Anything else sharing
    // that identifier (a different gate shape, a leaf event, …) is a real
    // conflict.
    const allStructurallyIdentical =
      !allLeafShareSafe &&
      ids.every((nid) => {
        const n = byId.get(nid);
        return n?.data.category === "gate" || n?.data.eventKind === "intermediate";
      }) &&
      new Set(ids.map((nid) => structuralSignature(nid, byId, childrenOf, signatureCache, new Set()))).size === 1;
    if (!allLeafShareSafe && !allStructurallyIdentical) {
      push("error", `Identifier "${id}" is used by ${ids.length} nodes; identifiers must be unique.`);
    }
  }

  for (const n of nodes) {
    const kids = childrenOf.get(n.id) ?? [];
    const isBox = n.data.category === "top" || n.data.eventKind === "intermediate";

    if (n.data.category === "gate") {
      const gateType = n.data.gateType ?? "or";
      // These mirror SCRAM's own Open-PSA MEF connective-arity rules
      // exactly (verified against `scram --validate`) — a tree that
      // violates them isn't just stylistically off, it's a formula SCRAM
      // will flat-out reject ("connective must have 2 or more arguments",
      // "did not expect element ... there", "min number cannot be less
      // than 2", …), so Run Analysis would otherwise silently exit 1 and
      // fall back to the built-in engine with no clear explanation.
      if (kids.length === 0) {
        push("error", `Gate "${n.data.identifier}" has no inputs.`, n.id);
      } else if (gateType === "not") {
        if (kids.length > 1) {
          push("error", `NOT gate "${n.data.identifier}" must have exactly one input.`, n.id);
        }
      } else if (gateType === "null") {
        if (kids.length > 1) {
          push("error", `NULL (pass-through) gate "${n.data.identifier}" must have exactly one input.`, n.id);
        }
      } else if (gateType === "xor" || gateType === "iff") {
        if (kids.length !== 2) {
          push(
            "error",
            `${gateType === "xor" ? "XOR" : "IFF"} gate "${n.data.identifier}" must have exactly two inputs (has ${kids.length}).`,
            n.id
          );
        }
      } else if (kids.length === 1) {
        push(
          "error",
          `Gate "${n.data.identifier}" has only one input; AND/OR/NAND/NOR/VOTE gates need at least two.`,
          n.id
        );
      }

      if (gateType === "atleast") {
        const k = n.data.votingK ?? 0;
        if (k < 2) {
          push("error", `Voting gate "${n.data.identifier}" needs k >= 2.`, n.id);
        } else if (kids.length > 0 && k >= kids.length) {
          // SCRAM requires strictly more inputs than the threshold — k
          // equal to the input count is rejected too (it degenerates to
          // a plain AND, so MEF makes you express it as one instead).
          push(
            "error",
            `Voting gate "${n.data.identifier}" has k=${k} but only ${kids.length} inputs; k must be less than the number of inputs.`,
            n.id
          );
        }
      }

      if (gateType === "cardinality") {
        const min = n.data.votingK ?? 0;
        const max = n.data.votingMax ?? 0;
        if (min < 0 || max < 0) {
          push("error", `Cardinality gate "${n.data.identifier}" bounds must not be negative.`, n.id);
        } else if (min > max) {
          push(
            "error",
            `Cardinality gate "${n.data.identifier}" has min=${min} > max=${max}; min must be <= max.`,
            n.id
          );
        } else if (kids.length > 0 && max > kids.length) {
          push(
            "error",
            `Cardinality gate "${n.data.identifier}" has max=${max} but only ${kids.length} inputs; max must be <= the number of inputs.`,
            n.id
          );
        }
      }
    } else if (isBox) {
      if (kids.length === 0) {
        push(
          "error",
          `"${n.data.identifier}" (${n.data.category === "top" ? "top event" : "intermediate event"}) has no gate defining its logic.`,
          n.id
        );
      } else if (kids.length > 1) {
        push("error", `"${n.data.identifier}" has more than one gate attached; it must have exactly one.`, n.id);
      }
    } else {
      const parents = parentsOf.get(n.id) ?? [];
      if (parents.length === 0) {
        push("warning", `Event "${n.data.identifier}" is not connected to any gate.`, n.id);
      }
    }
  }

  // Circular dependency detection (DFS over child -> parent edges)
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]));
  const stack: string[] = [];
  let cycleFound = false;

  function visit(id: string) {
    if (cycleFound) return;
    color.set(id, GRAY);
    stack.push(id);
    for (const parent of parentsOf.get(id) ?? []) {
      const c = color.get(parent);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(parent);
        const cyclePath = stack.slice(cycleStart).concat(parent);
        push(
          "error",
          `Circular dependency detected: ${cyclePath
            .map((nid) => nodes.find((n) => n.id === nid)?.data.identifier ?? nid)
            .join(" -> ")}.`
        );
        cycleFound = true;
        return;
      } else if (c === WHITE) {
        visit(parent);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) visit(n.id);
  }

  // Probability sanity checks
  for (const n of nodes) {
    if (n.data.category === "event" && n.data.eventKind !== "house") {
      const v = n.data.probability?.value;
      if (v !== undefined && (v < 0 || v > 1)) {
        push("error", `Event "${n.data.identifier}" probability must be between 0 and 1.`, n.id);
      }
    }
  }

  // CCF group sanity checks — a negative or out-of-range factor/probability
  // is meaningless as a fraction and SCRAM rejects it outright at analysis
  // time (exiting non-zero with little context), so Run Analysis would
  // otherwise fail confusingly well after the point a user could fix it.
  // Catching it here, the same way every other structural issue is, blocks
  // the run with a clear, specific message instead.
  for (const g of ccfGroups) {
    const qLabel = `CCF group "${g.name}"`;
    const q = g.groupProbability.value;
    if (q !== undefined && (q < 0 || q > 1)) {
      push("error", `${qLabel} group probability must be between 0 and 1 (got ${q}).`);
    }
    g.factors.forEach((f, i) => {
      const levelLabel = g.model === "beta-factor" ? "β" : `level-${i + (g.model === "alpha-factor" ? 1 : 2)} factor`;
      if (f < 0 || f > 1) {
        push("error", `${qLabel}'s ${levelLabel} must be between 0 and 1 (got ${f}).`);
      }
    });
  }

  return issues;
}
