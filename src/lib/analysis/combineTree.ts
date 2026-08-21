import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { CcfGroup, LintIssue } from "@/types/fta";
import { runLint } from "@/lib/validation/lint";

export interface TreeSource {
  id: string;
  nodes: FTANode[];
  edges: FTAEdge[];
}

export interface UnresolvedTransfer {
  nodeId: string;
  tabId: string;
  identifier: string;
}

export interface CombinedTree {
  nodes: FTANode[];
  edges: FTAEdge[];
  /** Which source tab each node in the combined graph came from, for
   * mapping a validation issue back to the tab a user needs to open to fix
   * it. */
  nodeOwnerTab: Map<string, string>;
  /** Transfer events whose identifier doesn't match any open tab — the
   * sub-tree they're supposed to expand into can't be found. */
  unresolvedTransfers: UnresolvedTransfer[];
  /** Transfer events that loop back into a tree already being expanded
   * above them. */
  cyclicTransfers: UnresolvedTransfer[];
}

function findRootGate(nodes: FTANode[], edges: FTAEdge[]): FTANode | null {
  const top = nodes.find((n) => n.data.category === "top");
  if (!top) return null;
  const rootEdge = edges.find((e) => e.target === top.id);
  if (!rootEdge) return null;
  return nodes.find((n) => n.id === rootEdge.source) ?? null;
}

/**
 * Expands every Transfer event in `main` into the sub-tree of the matching
 * open tab, producing one fully self-contained {nodes, edges} graph. Without
 * this, Run Analysis / MEF export only ever saw whichever single tab was
 * active — a transfer event was analyzed as its own disconnected tree, or
 * (worse) just as a constant-probability stub if you ran it from the main
 * tab. This splices each transfer's sub-tree directly under its parent gate
 * so the whole thing analyzes as one fault tree, with results attributed to
 * the main tree's TOP event.
 *
 * Node ids and Open-PSA identifiers are already unique across the whole app
 * (both come from module-wide counters, never reset per tab), so trees can
 * be merged directly with no re-namespacing.
 */
export function buildCombinedTree(main: TreeSource, allTrees: TreeSource[]): CombinedTree {
  const treeById = new Map(allTrees.map((t) => [t.id, t]));
  const outNodes = new Map<string, FTANode>();
  const outEdges = new Map<string, FTAEdge>();
  const nodeOwnerTab = new Map<string, string>();
  const unresolvedTransfers: UnresolvedTransfer[] = [];
  const cyclicTransfers: UnresolvedTransfer[] = [];

  function walk(source: TreeSource, isRoot: boolean, visiting: Set<string>) {
    const byId = new Map(source.nodes.map((n) => [n.id, n]));

    for (const n of source.nodes) {
      // A sub-tree's own synthetic TOP wrapper isn't part of the combined
      // graph (and every tab's TOP node shares the literal id "TOP", so
      // merging it in would silently clobber the main tree's real TOP).
      if (!isRoot && n.data.category === "top") continue;
      outNodes.set(n.id, n);
      nodeOwnerTab.set(n.id, source.id);
    }
    for (const e of source.edges) {
      const target = byId.get(e.target);
      if (!isRoot && target?.data.category === "top") continue;
      outEdges.set(e.id, e);
    }

    for (const n of source.nodes) {
      if (n.data.category !== "event" || n.data.eventKind !== "transfer") continue;

      const targetTree = treeById.get(n.data.identifier);
      if (!targetTree) {
        // References a tab that was never created/opened — left as an
        // inert leaf in the combined graph, silently understating whatever
        // that sub-tree would actually contribute.
        unresolvedTransfers.push({ nodeId: n.id, tabId: source.id, identifier: n.data.identifier });
        continue;
      }
      if (visiting.has(n.data.identifier)) {
        cyclicTransfers.push({ nodeId: n.id, tabId: source.id, identifier: n.data.identifier });
        continue;
      }

      const rootGate = findRootGate(targetTree.nodes, targetTree.edges);
      if (!rootGate) {
        unresolvedTransfers.push({ nodeId: n.id, tabId: source.id, identifier: n.data.identifier });
        continue;
      }

      // Redirect: whatever fed into the transfer leaf now feeds directly
      // into the sub-tree's root gate, and the leaf itself is dropped.
      for (const e of source.edges) {
        if (e.source === n.id) outEdges.set(e.id, { ...e, source: rootGate.id });
      }
      outNodes.delete(n.id);
      nodeOwnerTab.delete(n.id);

      const nextVisiting = new Set(visiting);
      nextVisiting.add(n.data.identifier);
      walk(targetTree, false, nextVisiting);
    }
  }

  walk(main, true, new Set());
  return {
    nodes: [...outNodes.values()],
    edges: [...outEdges.values()],
    nodeOwnerTab,
    unresolvedTransfers,
    cyclicTransfers,
  };
}

/**
 * Validates the *whole* model — the main tree plus every transfer sub-tree
 * it reaches — not just whichever single tab happens to be open. Without
 * this, a structural error sitting inside a transfer tree (a gate with no
 * inputs, a duplicate identifier, a cycle) never surfaces unless a user
 * happens to click into that exact tab, so Run Analysis would silently
 * execute against a broken tree and hand back results anyway.
 */
export function validateCombinedTree(main: TreeSource, allTrees: TreeSource[], ccfGroups: CcfGroup[] = []): LintIssue[] {
  const combined = buildCombinedTree(main, allTrees);
  const issues: LintIssue[] = runLint(combined.nodes, combined.edges, ccfGroups).map((issue) => ({
    ...issue,
    tabId: issue.nodeId ? combined.nodeOwnerTab.get(issue.nodeId) : undefined,
  }));

  let seq = issues.length;
  for (const t of combined.unresolvedTransfers) {
    issues.push({
      id: `lint-transfer-unresolved-${seq++}`,
      severity: "error",
      message: `Transfer event "${t.identifier}" doesn't match any open tree — open (or build) that tab, or Run Analysis will silently treat it as a dead-end leaf instead of the sub-tree it's supposed to be.`,
      nodeId: t.nodeId,
      tabId: t.tabId,
    });
  }
  for (const t of combined.cyclicTransfers) {
    issues.push({
      id: `lint-transfer-cycle-${seq++}`,
      severity: "error",
      message: `Transfer event "${t.identifier}" circularly refers back to a tree it's already nested inside — this can't be expanded into a finite tree.`,
      nodeId: t.nodeId,
      tabId: t.tabId,
    });
  }
  return issues;
}
