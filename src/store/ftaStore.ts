import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type {
  FaultTreeNodeData,
  AnalysisResults,
  CcfGroup,
  CcfModel,
  LintIssue,
  RunOptions,
  GateType,
  EventKind,
} from "@/types/fta";
import { toast } from "@/store/toastStore";

export type FTANode = Node<FaultTreeNodeData>;
export type FTAEdge = Edge;

export const defaultRunOptions: RunOptions = {
  algorithm: "bdd",
  probability: true,
  importance: true,
  uncertainty: false,
  primeImplicants: false,
  numTrials: 1000,
  missionTime: 8760,
  limitOrder: 5,
  cutOff: 1e-12,
};

export const MAIN_TAB_ID = "main";

function makeTopEvent(label = "System Failure"): FTANode {
  return {
    id: "TOP",
    type: "event",
    position: { x: 0, y: 0 },
    data: {
      label,
      identifier: "TOP",
      category: "top",
    },
  };
}

interface TrackedState {
  nodes: FTANode[];
  edges: FTAEdge[];
}

/** "symbol" renders each gate's standard boolean-algebra glyph (· for AND, + for OR, etc.). */
export type GateLabelStyle = "text" | "symbol" | "hidden";

export type MainView = "diagram" | "results";

/** Which pieces of per-node text are drawn on the canvas (View menu). */
export interface NodeDisplayOptions {
  showLabel: boolean;
  showIdentifier: boolean;
  showProbability: boolean;
}

/** An inactive fault-tree page, parked while another tab is active. Transfer
 * events open/create one of these, keyed by the transfer's own identifier. */
export interface TreeTab {
  id: string;
  name: string;
  nodes: FTANode[];
  edges: FTAEdge[];
}

interface FTAState extends TrackedState {
  selectedIds: string[];
  theme: "light" | "dark";
  runOptions: RunOptions;
  results: AnalysisResults | null;
  isRunning: boolean;
  /** Non-null while the "can't run this safely" modal should be shown —
   * set from `AnalysisResourceLimitError` (either a too-large SCRAM report
   * or the built-in engine's own cut-set-explosion cap). */
  resourceLimitError: { message: string; nodeCount: number; detail: string } | null;
  setResourceLimitError: (err: { message: string; nodeCount: number; detail: string } | null) => void;
  /** Current app process memory (RSS, bytes), polled periodically —
   * `null` until the first successful poll, or permanently outside Tauri. */
  memoryUsageBytes: number | null;
  setMemoryUsageBytes: (bytes: number | null) => void;
  /** Single shared source of truth for the Run Options dialog's open state —
   * both the toolbar's and the menu bar's "Run Analysis" triggers (and the
   * Ctrl+R keyboard shortcut) open the same dialog instance instead of each
   * mounting/tracking their own. */
  runDialogOpen: boolean;
  setRunDialogOpen: (open: boolean) => void;
  /** Same shared-single-instance pattern as `runDialogOpen` — lets the
   * File menu's "New Model" item and the Ctrl+N shortcut open the same
   * confirmation dialog instance. */
  newModelConfirmOpen: boolean;
  setNewModelConfirmOpen: (open: boolean) => void;
  /** Same shared-single-instance pattern as `runDialogOpen` — the Ctrl+E
   * shortcut and (if one's ever added) a menu item both open the same
   * "export diagram/report as…" picker. */
  exportPickerOpen: boolean;
  setExportPickerOpen: (open: boolean) => void;
  /** Same shared-single-instance pattern as `runDialogOpen`, for the
   * "delete this and everything beneath it?" confirmation — set whenever a
   * delete (context menu or Delete/Backspace) would orphan descendant
   * nodes, cleared once answered. */
  pendingDelete: { ids: string[]; label: string; descendantCount: number } | null;
  setPendingDelete: (v: FTAState["pendingDelete"]) => void;
  lintIssues: LintIssue[];
  /** The file this session is currently associated with — set on a
   * successful Open-PSA MEF import, or after any export completes (mirrors
   * "Save As" updating a document's identity in a conventional desktop
   * app). `null` for a fresh/new/never-saved model. `documentName` is
   * purely a display label (window title bar, the toolbar); `documentPath`
   * is the actual full filesystem path (`null` outside Tauri, or if this
   * document has never been saved/opened via a real file), used to back a
   * dialog-free "Save" that just rewrites the same file — as opposed to
   * "Save As", which always prompts. Importing/exporting always work with
   * the full in-memory model regardless of these values, and they're never
   * read back to decide *whether* to save, only *where*. Persisted through
   * crash-recovery snapshots (`autosave.ts`) so a restored session still
   * shows the right name and can still quick-save to the right place. */
  documentName: string | null;
  documentKind: "openpsa-xml" | "json" | null;
  documentPath: string | null;
  setDocument: (name: string | null, kind: FTAState["documentKind"], path?: string | null) => void;
  /** Whether the in-memory model has changed since the last import/export
   * (or since launch, for a never-saved model) — backs the close-window
   * "you have unsaved changes" warning. Sits outside `TrackedState` like
   * `documentName`: it reflects "does this differ from what's on disk",
   * which undo/redo doesn't change the answer to (undoing back to a
   * previously-saved state doesn't retroactively know it matches disk
   * either, so this deliberately doesn't try to track that — once dirty,
   * only a fresh import/export/new-model clears it, same as every other
   * editor's simple dirty flag).
   *
   * Set to `true` explicitly at every actual content-editing action below
   * (`updateNodeData`, `addChildGate`, `removeNodes`, CCF group edits,
   * `onNodesChange`/`onEdgesChange` for real changes, …), NOT inferred
   * from a generic "did nodes/edges change" watcher — that was tried
   * first and doesn't work: React Flow fires its own internal
   * "dimensions"/"select" `NodeChange`s (initial mount measurement, plain
   * click-to-select) that change the `nodes` array's reference without
   * being a real edit, so a reference-diffing effect flags a session
   * dirty just from being opened and clicked around in, never mind
   * actually edited. `loadModel`/`resetModel`/`restoreSession` clear it
   * back to `false` in the same `set()` call that (re)populates the
   * model, since a freshly-loaded model matches disk by definition. */
  dirty: boolean;
  setDirty: (b: boolean) => void;
  scramBinaryPath: string | null;
  scramAvailable: boolean | null;
  /** Whether the current `scramBinaryPath` came from PATH auto-detection
   * or a user-picked folder — purely for UI display ("Auto-detected" vs
   * "Manually selected"), doesn't affect how it's used to run analysis. */
  scramSource: "bundled" | "auto" | "manual" | null;
  setScramSource: (source: FTAState["scramSource"]) => void;
  /** Single shared source of truth for the "Select SCRAM Location" dialog,
   * same pattern as `runDialogOpen`. */
  scramLocationDialogOpen: boolean;
  setScramLocationDialogOpen: (open: boolean) => void;
  gateLabelStyle: GateLabelStyle;
  nodeDisplay: NodeDisplayOptions;
  mainView: MainView;
  /** Left sidebar (Explorer/Validation/CCF) and right sidebar (Inspector)
   * visibility — toggled from the View menu, and "Show Properties" on a
   * node's context menu force-shows the right one. */
  showLeftPanel: boolean;
  showRightPanel: boolean;
  setShowLeftPanel: (show: boolean) => void;
  setShowRightPanel: (show: boolean) => void;
  /** Gate ids whose subtree is collapsed into a compact badge on the canvas. */
  collapsedGateIds: string[];
  /** Shrinks node footprints and spacing across the whole canvas so more of
   * a large tree fits on screen at once. */
  compactView: boolean;

  activeTabId: string;
  activeTabName: string;
  tabs: TreeTab[];

  /** Common-cause failure groups — model-wide (like `tabs`), not scoped to
   * a single tab, since a group's members can span the whole tree. */
  ccfGroups: CcfGroup[];
  addCcfGroup: () => string;
  updateCcfGroup: (id: string, patch: Partial<Omit<CcfGroup, "id">>) => void;
  removeCcfGroup: (id: string) => void;
  /** Replaces every CCF group wholesale — used after importing a model, same
   * "replace, don't merge" contract as `loadModel` for nodes/edges. */
  setCcfGroups: (groups: CcfGroup[]) => void;

  onNodesChange: (changes: NodeChange<FTANode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  updateNodeData: (id: string, patch: Partial<FaultTreeNodeData>) => void;
  removeNodes: (ids: string[]) => void;
  /** Adds a Gate as the (single) child of an event node, e.g. TOP or an intermediate event. */
  addChildGate: (parentEventId: string, gateType: GateType) => string;
  /** Adds an Event as a child of a gate node. */
  addChildEvent: (parentGateId: string, eventKind: EventKind) => string;
  changeGateType: (gateId: string, gateType: GateType) => void;
  setVotingK: (gateId: string, k: number) => void;
  setCardinality: (gateId: string, min: number, max: number) => void;
  setNodes: (nodes: FTANode[]) => void;
  setEdges: (edges: FTAEdge[]) => void;
  setSelected: (ids: string[]) => void;
  /** Selects exactly these ids both in `selectedIds` and on the nodes
   * themselves (`node.selected`), so a Tree View click highlights the node
   * on the canvas too — canvas clicks already keep both in sync via
   * ReactFlow's own onNodesChange/onSelectionChange pipeline, but that
   * pipeline only fires from clicks the canvas itself sees. */
  selectOnly: (ids: string[]) => void;
  applyLayout: (positioned: { id: string; x: number; y: number }[]) => void;

  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  setGateLabelStyle: (s: GateLabelStyle) => void;
  setNodeDisplay: (patch: Partial<NodeDisplayOptions>) => void;
  setMainView: (v: MainView) => void;
  toggleGateCollapsed: (gateId: string) => void;
  toggleCompactView: () => void;

  setRunOptions: (patch: Partial<RunOptions>) => void;
  setResults: (r: AnalysisResults | null) => void;
  setRunning: (b: boolean) => void;
  setLintIssues: (issues: LintIssue[]) => void;
  setScramBinary: (path: string | null) => void;
  setScramAvailable: (b: boolean | null) => void;

  loadModel: (nodes: FTANode[], edges: FTAEdge[]) => void;
  resetModel: () => void;
  /** Restores a full multi-tab session (e.g. from an autosave snapshot) —
   * unlike `loadModel`, which only replaces the active tab's nodes/edges,
   * this also replaces `tabs`/`activeTabId`/`activeTabName` wholesale. */
  restoreSession: (
    nodes: FTANode[],
    edges: FTAEdge[],
    tabs: TreeTab[],
    activeTabId: string,
    activeTabName: string,
    documentName?: string | null,
    documentKind?: FTAState["documentKind"],
    documentPath?: string | null
  ) => void;

  /** Switches to another already-open tab, parking the current one. */
  switchTab: (id: string) => void;
  /** Opens the sub-tree linked to a transfer event, creating a fresh one on first visit. */
  openTransferTab: (identifier: string, label: string) => void;
  closeTab: (id: string) => void;
}

let idCounter = 1;
export function nextNodeId(prefix: string) {
  return `${prefix}-${idCounter++}-${Date.now().toString(36)}`;
}

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  basic: "Basic",
  undeveloped: "Undeveloped",
  house: "House",
  conditional: "Conditional",
  intermediate: "Intermediate",
  transfer: "Transfer",
};
const GATE_TYPE_LABEL: Record<GateType, string> = {
  and: "AND",
  or: "OR",
  atleast: "Vote",
  not: "NOT",
  xor: "XOR",
  nand: "NAND",
  nor: "NOR",
  iff: "IFF",
  cardinality: "Card",
  null: "Pass",
};

const eventKindCounters: Record<EventKind, number> = {
  basic: 0,
  undeveloped: 0,
  house: 0,
  conditional: 0,
  intermediate: 0,
  transfer: 0,
};
const gateTypeCounters: Record<GateType, number> = {
  and: 0,
  or: 0,
  atleast: 0,
  not: 0,
  xor: 0,
  nand: 0,
  nor: 0,
  iff: 0,
  cardinality: 0,
  null: 0,
};

function nextEventName(kind: EventKind): { label: string; identifier: string } {
  const n = ++eventKindCounters[kind];
  const base = EVENT_KIND_LABEL[kind];
  return { label: `${base} ${n}`, identifier: `${base}${n}` };
}

function nextGateName(gateType: GateType): { label: string; identifier: string } {
  const n = ++gateTypeCounters[gateType];
  const base = GATE_TYPE_LABEL[gateType];
  return { label: `${base} ${n}`, identifier: `${base}${n}` };
}

/** Resyncs the default-naming counters from the highest matching suffix
 * already present in `nodes`, so new defaults never collide after a
 * reset/import (e.g. importing "Basic3" means the next default is "Basic 4"). */
function resyncCounters(nodes: FTANode[]) {
  for (const kind of Object.keys(eventKindCounters) as EventKind[]) eventKindCounters[kind] = 0;
  for (const gt of Object.keys(gateTypeCounters) as GateType[]) gateTypeCounters[gt] = 0;

  for (const n of nodes) {
    if (n.data.category === "gate") {
      const gt = n.data.gateType;
      if (!gt) continue;
      const m = n.data.identifier.match(new RegExp(`^${GATE_TYPE_LABEL[gt]}(\\d+)$`));
      if (m) gateTypeCounters[gt] = Math.max(gateTypeCounters[gt], Number(m[1]));
    } else if (n.data.eventKind) {
      const kind = n.data.eventKind;
      const m = n.data.identifier.match(new RegExp(`^${EVENT_KIND_LABEL[kind]}(\\d+)$`));
      if (m) eventKindCounters[kind] = Math.max(eventKindCounters[kind], Number(m[1]));
    }
  }
}

export const useFTAStore = create<FTAState>()(
  temporal(
    immer((set, get) => ({
      nodes: [makeTopEvent()],
      edges: [],
      selectedIds: [],
      theme: "dark",
      runOptions: defaultRunOptions,
      results: null,
      isRunning: false,
      resourceLimitError: null,
      memoryUsageBytes: null,
      runDialogOpen: false,
      newModelConfirmOpen: false,
      exportPickerOpen: false,
      pendingDelete: null,
      lintIssues: [],
      documentName: null,
      documentKind: null,
      documentPath: null,
      dirty: false,
      scramBinaryPath: null,
      scramAvailable: null,
      scramSource: null,
      scramLocationDialogOpen: false,
      gateLabelStyle: "text",
      nodeDisplay: { showLabel: true, showIdentifier: false, showProbability: true },
      mainView: "diagram",
      showLeftPanel: true,
      showRightPanel: true,
      collapsedGateIds: [],
      compactView: false,
      activeTabId: MAIN_TAB_ID,
      activeTabName: "Main Tree",
      tabs: [],
      ccfGroups: [],

      setRunDialogOpen: (open) =>
        set((state) => {
          state.runDialogOpen = open;
        }),

      setNewModelConfirmOpen: (open) =>
        set((state) => {
          state.newModelConfirmOpen = open;
        }),

      setExportPickerOpen: (open) =>
        set((state) => {
          state.exportPickerOpen = open;
        }),

      setPendingDelete: (v) =>
        set((state) => {
          state.pendingDelete = v;
        }),

      addCcfGroup: () => {
        const id = nextNodeId("CCF");
        const defaultModel: CcfModel = "beta-factor";
        set((state) => {
          state.ccfGroups.push({
            id,
            name: `CCF Group ${state.ccfGroups.length + 1}`,
            model: defaultModel,
            memberIdentifiers: [],
            groupProbability: { value: 1e-5 },
            factors: [0.1],
          });
          state.dirty = true;
        });
        return id;
      },

      updateCcfGroup: (id, patch) =>
        set((state) => {
          const group = state.ccfGroups.find((g) => g.id === id);
          if (group) {
            Object.assign(group, patch);
            state.dirty = true;
          }
        }),

      removeCcfGroup: (id) =>
        set((state) => {
          state.ccfGroups = state.ccfGroups.filter((g) => g.id !== id);
          state.dirty = true;
        }),

      // Not marked dirty — this is exclusively `handleImport`'s way of
      // installing a freshly-parsed file's CCF groups, always called right
      // alongside `loadModel` (which already clears `dirty` for the whole
      // import). It's never used for hand-editing groups from the CCF
      // panel (that's `addCcfGroup`/`updateCcfGroup`/`removeCcfGroup`,
      // above, which do mark dirty) — if it ever gains a second caller,
      // that caller owns deciding whether its own change is dirty-worthy.
      setCcfGroups: (groups) =>
        set((state) => {
          state.ccfGroups = groups;
        }),

      // "dimensions" changes are React Flow's own internal node-measurement
      // pass (fires once per node as it first mounts, and again whenever
      // its rendered size changes) and "select" is just click/marquee
      // selection state — neither is a content edit, so neither should
      // trip the close-window "unsaved changes" warning. Only "position"
      // (dragged), "remove", "add", and "replace" represent an actual
      // change to what would get exported.
      onNodesChange: (changes) =>
        set((state) => {
          state.nodes = applyNodeChanges(changes, state.nodes) as FTANode[];
          if (changes.some((c) => c.type !== "dimensions" && c.type !== "select")) state.dirty = true;
        }),

      onEdgesChange: (changes) =>
        set((state) => {
          state.edges = applyEdgeChanges(changes, state.edges) as FTAEdge[];
          if (changes.some((c) => c.type !== "select")) state.dirty = true;
        }),

      updateNodeData: (id, patch) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === id);
          if (node) {
            Object.assign(node.data, patch);
            state.dirty = true;
          }
        }),

      addChildGate: (parentEventId, gateType) => {
        const id = nextNodeId("G");
        const { label, identifier } = nextGateName(gateType);
        set((state) => {
          const parent = state.nodes.find((n) => n.id === parentEventId);
          const position = parent
            ? { x: parent.position.x, y: parent.position.y + 160 }
            : { x: 0, y: 160 };
          state.nodes.push({
            id,
            type: "gate",
            position,
            data: {
              label,
              identifier,
              category: "gate",
              gateType,
              votingK: gateType === "atleast" ? 2 : undefined,
            },
          });
          state.edges.push({
            id: `e-${id}-${parentEventId}`,
            source: id,
            target: parentEventId,
            sourceHandle: "out",
            targetHandle: "in",
            type: "orthogonal",
          });
          state.dirty = true;
        });
        return id;
      },

      addChildEvent: (parentGateId, eventKind) => {
        // NOT and NULL (pass-through) gates take exactly one input — this
        // is the single enforcement point for that rule (both the context
        // menu and the "E" keyboard shortcut call straight through here),
        // so a caller can't bypass the UI-level guard in GateNode.tsx. Lint
        // already flags this after the fact; this stops it from ever
        // happening instead.
        const parentGate = get().nodes.find((n) => n.id === parentGateId);
        const parentGateType = parentGate?.data.gateType;
        if (parentGateType === "not" || parentGateType === "null") {
          const existingChildren = get().edges.filter((e) => e.target === parentGateId).length;
          if (existingChildren >= 1) {
            toast({
              title: "Can't add another input",
              description: `A ${parentGateType === "not" ? "NOT" : "NULL"} gate takes exactly one input — change its type first if you need more.`,
              variant: "destructive",
            });
            return "";
          }
        }
        const id = nextNodeId("E");
        const { label, identifier } = nextEventName(eventKind);
        set((state) => {
          const parent = state.nodes.find((n) => n.id === parentGateId);
          const siblingCount = state.edges.filter((e) => e.target === parentGateId).length;
          const position = parent
            ? { x: parent.position.x + siblingCount * 160, y: parent.position.y + 160 }
            : { x: siblingCount * 160, y: 160 };
          state.nodes.push({
            id,
            type: "event",
            position,
            data: {
              label,
              identifier,
              category: "event",
              eventKind,
              probability: eventKind === "house" ? { booleanState: false } : { value: 1e-4 },
            },
          });
          state.edges.push({
            id: `e-${id}-${parentGateId}`,
            source: id,
            target: parentGateId,
            sourceHandle: "out",
            targetHandle: "in",
            type: "orthogonal",
          });
          state.dirty = true;
        });
        return id;
      },

      changeGateType: (gateId, gateType) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === gateId);
          if (!node) return;
          node.data.gateType = gateType;
          if (gateType === "atleast" && !node.data.votingK) {
            node.data.votingK = 2;
          } else if (gateType === "cardinality") {
            if (node.data.votingK === undefined) node.data.votingK = 1;
            if (node.data.votingMax === undefined) node.data.votingMax = 2;
          } else {
            node.data.votingK = undefined;
          }
          if (gateType !== "cardinality") node.data.votingMax = undefined;
          state.dirty = true;
        }),

      setVotingK: (gateId, k) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === gateId);
          if (node) {
            node.data.votingK = Math.max(1, Math.floor(k));
            state.dirty = true;
          }
        }),

      setCardinality: (gateId, min, max) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === gateId);
          if (!node) return;
          const safeMin = Math.max(0, Math.floor(min));
          const safeMax = Math.max(safeMin, Math.floor(max));
          node.data.votingK = safeMin;
          node.data.votingMax = safeMax;
          state.dirty = true;
        }),

      removeNodes: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          state.nodes = state.nodes.filter((n) => !idSet.has(n.id));
          state.edges = state.edges.filter(
            (e) => !idSet.has(e.source) && !idSet.has(e.target)
          );
          state.selectedIds = state.selectedIds.filter((id) => !idSet.has(id));
          state.dirty = true;
        }),

      setNodes: (nodes) =>
        set((state) => {
          state.nodes = nodes;
          state.dirty = true;
        }),

      setEdges: (edges) =>
        set((state) => {
          state.edges = edges;
          state.dirty = true;
        }),

      setSelected: (ids) =>
        set((state) => {
          // Canvas selection flows store -> nodes -> ReactFlow -> onSelectionChange
          // -> here; without this no-op guard, a same-content-but-new-array
          // update would re-trigger that cycle forever.
          const current = state.selectedIds;
          const unchanged = current.length === ids.length && current.every((id) => ids.includes(id));
          if (unchanged) return;
          state.selectedIds = ids;
        }),

      selectOnly: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          for (const n of state.nodes) n.selected = idSet.has(n.id);
          state.selectedIds = ids;
        }),

      applyLayout: (positioned) =>
        set((state) => {
          const byId = new Map(positioned.map((p) => [p.id, p]));
          for (const node of state.nodes) {
            const pos = byId.get(node.id);
            if (pos) node.position = { x: pos.x, y: pos.y };
          }
          state.dirty = true;
        }),

      setTheme: (t) =>
        set((state) => {
          state.theme = t;
        }),
      toggleTheme: () =>
        set((state) => {
          state.theme = state.theme === "dark" ? "light" : "dark";
        }),
      setGateLabelStyle: (s) =>
        set((state) => {
          state.gateLabelStyle = s;
        }),
      setNodeDisplay: (patch) =>
        set((state) => {
          Object.assign(state.nodeDisplay, patch);
        }),
      setMainView: (v) =>
        set((state) => {
          state.mainView = v;
        }),
      toggleGateCollapsed: (gateId) =>
        set((state) => {
          const idx = state.collapsedGateIds.indexOf(gateId);
          if (idx >= 0) state.collapsedGateIds.splice(idx, 1);
          else state.collapsedGateIds.push(gateId);
        }),
      toggleCompactView: () =>
        set((state) => {
          state.compactView = !state.compactView;
        }),

      setRunOptions: (patch) =>
        set((state) => {
          Object.assign(state.runOptions, patch);
        }),
      setResults: (r) =>
        set((state) => {
          state.results = r;
        }),
      setRunning: (b) =>
        set((state) => {
          state.isRunning = b;
        }),
      setResourceLimitError: (err) =>
        set((state) => {
          state.resourceLimitError = err;
        }),
      setMemoryUsageBytes: (bytes) =>
        set((state) => {
          state.memoryUsageBytes = bytes;
        }),
      setLintIssues: (issues) =>
        set((state) => {
          state.lintIssues = issues;
        }),
      setDocument: (name, kind, path) =>
        set((state) => {
          state.documentName = name;
          state.documentKind = kind;
          state.documentPath = path ?? null;
        }),
      setDirty: (b) =>
        set((state) => {
          state.dirty = b;
        }),
      setScramBinary: (path) =>
        set((state) => {
          state.scramBinaryPath = path;
        }),
      setScramAvailable: (b) =>
        set((state) => {
          state.scramAvailable = b;
        }),
      setScramSource: (source) =>
        set((state) => {
          state.scramSource = source;
        }),
      setScramLocationDialogOpen: (open) =>
        set((state) => {
          state.scramLocationDialogOpen = open;
        }),
      setShowLeftPanel: (show) =>
        set((state) => {
          state.showLeftPanel = show;
        }),
      setShowRightPanel: (show) =>
        set((state) => {
          state.showRightPanel = show;
        }),

      loadModel: (nodes, edges) => {
        resyncCounters(nodes);
        set((state) => {
          state.nodes = nodes;
          state.edges = edges;
          state.selectedIds = [];
          state.collapsedGateIds = [];
          state.results = null;
          state.dirty = false;
        });
      },

      /** Wipes everything model-specific — the active tree, every parked
       * transfer-tab tree, prior results, and undo/redo history — back to
       * a single fresh TOP event. Previously this only reset `nodes`/`edges`,
       * so a "New Model" left old transfer tabs, stale analysis results,
       * and the whole undo stack (which could restore the old tree right
       * back) sitting around behind the scenes. Display preferences (theme,
       * compact view, run options, SCRAM detection) are intentionally left
       * alone — those aren't part of "the model". */
      resetModel: () => {
        resyncCounters([]);
        useFTAStore.temporal.getState().clear();
        set((state) => {
          state.nodes = [makeTopEvent()];
          state.edges = [];
          state.selectedIds = [];
          state.collapsedGateIds = [];
          state.results = null;
          state.lintIssues = [];
          state.tabs = [];
          state.ccfGroups = [];
          state.activeTabId = MAIN_TAB_ID;
          state.activeTabName = "Main Tree";
          state.mainView = "diagram";
          state.documentName = null;
          state.documentKind = null;
          state.documentPath = null;
          state.dirty = false;
        });
      },

      restoreSession: (nodes, edges, tabs, activeTabId, activeTabName, documentName, documentKind, documentPath) => {
        resyncCounters([...nodes, ...tabs.flatMap((t) => t.nodes)]);
        useFTAStore.temporal.getState().clear();
        set((state) => {
          state.nodes = nodes;
          state.edges = edges;
          state.tabs = tabs;
          state.activeTabId = activeTabId;
          state.activeTabName = activeTabName;
          state.selectedIds = [];
          state.collapsedGateIds = [];
          state.results = null;
          state.lintIssues = [];
          state.mainView = "diagram";
          state.documentName = documentName ?? null;
          state.documentKind = documentKind ?? null;
          state.documentPath = documentPath ?? null;
          state.dirty = false;
        });
      },

      switchTab: (targetId) => {
        useFTAStore.temporal.getState().pause();
        set((state) => {
          if (targetId === state.activeTabId) return;

          const currentSnapshot: TreeTab = {
            id: state.activeTabId,
            name: state.activeTabName,
            nodes: state.nodes,
            edges: state.edges,
          };
          const curIdx = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (curIdx >= 0) state.tabs[curIdx] = currentSnapshot;
          else state.tabs.push(currentSnapshot);

          const targetIdx = state.tabs.findIndex((t) => t.id === targetId);
          if (targetIdx < 0) return;
          const target = state.tabs[targetIdx];
          state.tabs.splice(targetIdx, 1);
          state.nodes = target.nodes;
          state.edges = target.edges;
          state.activeTabId = target.id;
          state.activeTabName = target.name;
          state.selectedIds = [];
          state.collapsedGateIds = [];
          // Results are always computed from the combined model across
          // every tab (see buildCombinedTree), not this one tab in
          // isolation, so switching tabs doesn't invalidate them — they
          // should stick around until the next Run Analysis or New Model.
          state.mainView = "diagram";
        });
        useFTAStore.temporal.getState().resume();
      },

      openTransferTab: (identifier, label) => {
        useFTAStore.temporal.getState().pause();
        set((state) => {
          if (state.activeTabId === identifier) return;

          const currentSnapshot: TreeTab = {
            id: state.activeTabId,
            name: state.activeTabName,
            nodes: state.nodes,
            edges: state.edges,
          };
          const curIdx = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (curIdx >= 0) state.tabs[curIdx] = currentSnapshot;
          else state.tabs.push(currentSnapshot);

          const existingIdx = state.tabs.findIndex((t) => t.id === identifier);
          if (existingIdx >= 0) {
            const target = state.tabs[existingIdx];
            state.tabs.splice(existingIdx, 1);
            state.nodes = target.nodes;
            state.edges = target.edges;
            state.activeTabId = target.id;
            state.activeTabName = target.name;
          } else {
            state.nodes = [makeTopEvent(label)];
            state.edges = [];
            state.activeTabId = identifier;
            state.activeTabName = label;
            // Only this branch is a real edit — a brand-new transfer-tree
            // tab now exists that'll be part of what gets exported. The
            // `if` branch above just parks/unparks an already-existing
            // tab, same as `switchTab` (not marked dirty either).
            state.dirty = true;
          }
          state.selectedIds = [];
          state.collapsedGateIds = [];
          state.mainView = "diagram";
        });
        useFTAStore.temporal.getState().resume();
      },

      closeTab: (id) =>
        set((state) => {
          if (state.activeTabId === id) {
            const fallback: TreeTab = state.tabs.find((t) => t.id !== id) ?? {
              id: MAIN_TAB_ID,
              name: "Main Tree",
              nodes: [makeTopEvent()],
              edges: [],
            };
            state.tabs = state.tabs.filter((t) => t.id !== id && t.id !== fallback.id);
            state.nodes = fallback.nodes;
            state.edges = fallback.edges;
            state.activeTabId = fallback.id;
            state.activeTabName = fallback.name;
            state.selectedIds = [];
            state.collapsedGateIds = [];
          } else {
            state.tabs = state.tabs.filter((t) => t.id !== id);
          }
          state.dirty = true;
        }),
    })),
    {
      limit: 100,
      partialize: (state: FTAState): TrackedState => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
);

export const useTemporalStore = () => useFTAStore.temporal;

/** Every tree currently known to the app — the active tab's live nodes/edges
 * plus every parked tab — keyed for `buildCombinedTree`. The main tree is
 * whichever of those has id === MAIN_TAB_ID (it's parked in `tabs` unless
 * you're currently viewing it). */
export function getTreeSources(): { main: TreeTab; all: TreeTab[] } {
  const state = useFTAStore.getState();
  const current: TreeTab = {
    id: state.activeTabId,
    name: state.activeTabName,
    nodes: state.nodes,
    edges: state.edges,
  };
  const all = [current, ...state.tabs];
  const main = all.find((t) => t.id === MAIN_TAB_ID) ?? current;
  return { main, all };
}
