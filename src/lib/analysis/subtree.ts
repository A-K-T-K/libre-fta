import type { FTANode, FTAEdge } from "@/store/ftaStore";

function buildChildrenOf(edges: FTAEdge[]): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }
  return childrenOf;
}

/** Every descendant (not including `rootId` itself) reachable below a node. */
export function collectDescendants(rootId: string, edges: FTAEdge[]): Set<string> {
  const childrenOf = buildChildrenOf(edges);
  const result = new Set<string>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return result;
}

/** Union of descendants below every collapsed gate — the set of node ids a
 * collapsed-subtree view should hide from the canvas and exclude from
 * layout. */
export function collectHiddenIds(collapsedGateIds: string[], edges: FTAEdge[]): Set<string> {
  const childrenOf = buildChildrenOf(edges);
  const hidden = new Set<string>();
  for (const gateId of collapsedGateIds) {
    const stack = [...(childrenOf.get(gateId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (hidden.has(id)) continue;
      hidden.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
  }
  return hidden;
}

/** Number of terminal (leaf) events under a gate — the "child count" shown
 * on a collapsed-subtree badge. Intermediate/top event boxes and nested
 * gates are just structure, not counted themselves. */
export function countLeafDescendants(rootId: string, nodes: FTANode[], edges: FTAEdge[]): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const descendants = collectDescendants(rootId, edges);
  let count = 0;
  for (const id of descendants) {
    const n = byId.get(id);
    if (n && n.data.category === "event" && n.data.eventKind !== "intermediate") count++;
  }
  return count;
}
