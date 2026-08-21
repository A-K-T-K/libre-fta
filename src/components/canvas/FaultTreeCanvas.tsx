import { useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  SelectionMode,
  ConnectionMode,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFTAStore, type FTANode, type FTAEdge } from "@/store/ftaStore";
import { GateNode } from "./nodes/GateNode";
import { EventNode } from "./nodes/EventNode";
import { OrthogonalEdge } from "./edges/OrthogonalEdge";
import { collectHiddenIds, countLeafDescendants } from "@/lib/analysis/subtree";
import { computeNodeProbability } from "@/lib/analysis/engine";

const REPEATABLE_KINDS = new Set(["basic", "undeveloped", "house", "conditional"]);

const nodeTypes = { gate: GateNode, event: EventNode };
const edgeTypes = { orthogonal: OrthogonalEdge };

export function FaultTreeCanvas() {
  const nodes = useFTAStore((s) => s.nodes);
  const edges = useFTAStore((s) => s.edges);
  const onNodesChange = useFTAStore((s) => s.onNodesChange);
  const onEdgesChange = useFTAStore((s) => s.onEdgesChange);
  const setSelected = useFTAStore((s) => s.setSelected);
  const openTransferTab = useFTAStore((s) => s.openTransferTab);
  const selectedIds = useFTAStore((s) => s.selectedIds);
  const collapsedGateIds = useFTAStore((s) => s.collapsedGateIds);
  const missionTime = useFTAStore((s) => s.runOptions.missionTime);

  const rfInstance = useRef<ReactFlowInstance<FTANode, FTAEdge> | null>(null);

  const hiddenIds = useMemo(() => collectHiddenIds(collapsedGateIds, edges), [collapsedGateIds, edges]);

  // Group terminal events by their Open-PSA identifier — two nodes sharing
  // one identifier represent the same physical event referenced twice in
  // the tree (a common-cause / shared basic event).
  const repeatedGroups = useMemo(() => {
    const byIdentifier = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.data.category === "event" && REPEATABLE_KINDS.has(n.data.eventKind ?? "")) {
        if (!byIdentifier.has(n.data.identifier)) byIdentifier.set(n.data.identifier, []);
        byIdentifier.get(n.data.identifier)!.push(n.id);
      }
    }
    const groupOf = new Map<string, string[]>();
    for (const ids of byIdentifier.values()) {
      if (ids.length > 1) for (const id of ids) groupOf.set(id, ids);
    }
    return groupOf;
  }, [nodes]);

  const activeRepeatedIds = useMemo(() => {
    const active = new Set<string>();
    for (const id of selectedIds) {
      const group = repeatedGroups.get(id);
      if (group) for (const gid of group) active.add(gid);
    }
    return active;
  }, [selectedIds, repeatedGroups]);

  // Reused across renders so a node whose own data *and* derived fields
  // (collapsed/repeated state) are both unchanged from last render keeps
  // the exact same decorated object identity — otherwise every drag/pan
  // rebuilt a brand-new `data` object for *every* node each render, which
  // defeated GateNode/EventNode's `memo()` entirely (React Flow diffs by
  // reference, so it re-rendered the whole tree on any single-node change).
  const decoratedNodeCache = useRef(new Map<string, { base: FTANode; sig: string; result: FTANode }>());

  const decoratedNodes = useMemo(() => {
    const cache = decoratedNodeCache.current;
    const nextCache = new Map<string, { base: FTANode; sig: string; result: FTANode }>();
    const result: FTANode[] = [];

    for (const n of nodes) {
      if (hiddenIds.has(n.id)) continue;

      const isCollapsedGate = n.data.category === "gate" && collapsedGateIds.includes(n.id);
      const repeatedGroup = repeatedGroups.get(n.id);
      const collapsedLeafCount = isCollapsedGate ? countLeafDescendants(n.id, nodes, edges) : undefined;
      const collapsedProbability = isCollapsedGate
        ? computeNodeProbability(nodes, edges, n.id, missionTime)
        : undefined;
      const repeatedCount = repeatedGroup?.length;
      const repeatedActive = activeRepeatedIds.has(n.id);
      const sig = `${isCollapsedGate}|${collapsedLeafCount}|${collapsedProbability}|${repeatedCount}|${repeatedActive}`;

      const cached = cache.get(n.id);
      if (cached && cached.base === n && cached.sig === sig) {
        nextCache.set(n.id, cached);
        result.push(cached.result);
        continue;
      }

      const decorated: FTANode = {
        ...n,
        data: { ...n.data, collapsed: isCollapsedGate, collapsedLeafCount, collapsedProbability, repeatedCount, repeatedActive },
      };
      nextCache.set(n.id, { base: n, sig, result: decorated });
      result.push(decorated);
    }

    decoratedNodeCache.current = nextCache;
    return result;
  }, [nodes, edges, hiddenIds, collapsedGateIds, repeatedGroups, activeRepeatedIds, missionTime]);

  // Edges have no per-render derived data anymore, so a plain WeakMap keyed
  // by the edge's own (stable-unless-actually-edited) object reference is
  // enough to keep unrelated edges from getting new identities every render.
  const decoratedEdgeCache = useRef(new WeakMap<FTAEdge, FTAEdge>());

  const decoratedEdges = useMemo(() => {
    const cache = decoratedEdgeCache.current;
    const result: FTAEdge[] = [];
    for (const e of edges) {
      if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) continue;
      let decorated = cache.get(e);
      if (!decorated) {
        decorated = { ...e, type: "orthogonal", markerEnd: undefined };
        cache.set(e, decorated);
      }
      result.push(decorated);
    }
    return result;
  }, [edges, hiddenIds]);

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: FTANode) => {
      if (node.data.eventKind === "transfer") {
        openTransferTab(node.data.identifier, node.data.label);
      }
    },
    [openTransferTab]
  );

  return (
    <div className="h-full w-full" style={{ background: "var(--canvas-bg)" }}>
      <ReactFlow<FTANode, FTAEdge>
        nodes={decoratedNodes}
        edges={decoratedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(inst) => (rfInstance.current = inst)}
        onSelectionChange={({ nodes: sel }) => setSelected(sel.map((n) => n.id))}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        zoomOnDoubleClick={false}
        connectionMode={ConnectionMode.Loose}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        panOnScroll
        selectNodesOnDrag={false}
        nodesDraggable={false}
        nodesConnectable={false}
        // Deletion is handled entirely by useKeyboardShortcuts/useDeleteNode
        // instead (cascades to descendants + warns before orphaning a
        // subtree) — React Flow's own key handling would just remove the
        // single node and strand its children.
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: "orthogonal" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="var(--canvas-dot)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={() => "var(--gate-stroke)"}
          maskColor="color-mix(in oklab, var(--canvas-bg) 70%, transparent)"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        />
        <Panel position="top-left" />
      </ReactFlow>
    </div>
  );
}
