import { useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useFTAStore, useTemporalStore, nextNodeId, getTreeSources, type FTANode, type FTAEdge } from "@/store/ftaStore";
import { layoutTree } from "@/lib/layout/elkLayout";
import { detectScramBinary, runAnalysis, findScramInFolder, validateScramBinary, getBundledScramPath, isTauriEnv, cancelRun as cancelActiveRun } from "@/lib/scram/runner";
import { AnalysisResourceLimitError } from "@/lib/analysis/resourceLimitError";
import { loadManualScramPath, saveManualScramPath } from "@/lib/scram/scramLocation";
import { serializeToOpenPsaXml } from "@/lib/openpsa/serializer";
import { buildCombinedTree } from "@/lib/analysis/combineTree";
import { parseOpenPsaXml } from "@/lib/openpsa/parser";
import { openXmlFile, openJsonFile, saveXmlFile, writeTextFileAt } from "@/lib/io/fileIO";
import { exportDiagramPng, exportDiagramSvg } from "@/lib/export/exportDiagram";
import { exportReportPdf, exportReportXml } from "@/lib/export/exportReport";
import { exportModelJson, parseModelJson } from "@/lib/export/exportJson";
import { toast } from "@/store/toastStore";
import { clearSnapshot } from "@/lib/io/autosave";

/** Shared wiring for canvas actions (undo/redo, layout, run, import/export)
 * used by both the toolbar and the top menu bar. */
export function useAppActions() {
  const rf = useReactFlow<FTANode, FTAEdge>();
  const nodes = useFTAStore((s) => s.nodes);
  const edges = useFTAStore((s) => s.edges);
  const applyLayout = useFTAStore((s) => s.applyLayout);
  const theme = useFTAStore((s) => s.theme);
  const toggleTheme = useFTAStore((s) => s.toggleTheme);
  const isRunning = useFTAStore((s) => s.isRunning);
  const setRunning = useFTAStore((s) => s.setRunning);
  const setResults = useFTAStore((s) => s.setResults);
  const setResourceLimitError = useFTAStore((s) => s.setResourceLimitError);
  const runOptions = useFTAStore((s) => s.runOptions);
  const setRunOptions = useFTAStore((s) => s.setRunOptions);
  const scramBinaryPath = useFTAStore((s) => s.scramBinaryPath);
  const setScramBinary = useFTAStore((s) => s.setScramBinary);
  const scramAvailable = useFTAStore((s) => s.scramAvailable);
  const setScramAvailable = useFTAStore((s) => s.setScramAvailable);
  const scramSource = useFTAStore((s) => s.scramSource);
  const setScramSource = useFTAStore((s) => s.setScramSource);
  const scramLocationDialogOpen = useFTAStore((s) => s.scramLocationDialogOpen);
  const setScramLocationDialogOpen = useFTAStore((s) => s.setScramLocationDialogOpen);
  const loadModel = useFTAStore((s) => s.loadModel);
  const setCcfGroups = useFTAStore((s) => s.setCcfGroups);
  const resetModel = useFTAStore((s) => s.resetModel);
  const documentName = useFTAStore((s) => s.documentName);
  const documentKind = useFTAStore((s) => s.documentKind);
  const documentPath = useFTAStore((s) => s.documentPath);
  const setDocument = useFTAStore((s) => s.setDocument);
  const setDirty = useFTAStore((s) => s.setDirty);
  const restoreSession = useFTAStore((s) => s.restoreSession);
  const results = useFTAStore((s) => s.results);
  const gateLabelStyle = useFTAStore((s) => s.gateLabelStyle);
  const nodeDisplay = useFTAStore((s) => s.nodeDisplay);
  const compactView = useFTAStore((s) => s.compactView);
  const toggleCompactView = useFTAStore((s) => s.toggleCompactView);
  const lintIssues = useFTAStore((s) => s.lintIssues);
  const hasBlockingErrors = lintIssues.some((i) => i.severity === "error");

  const temporal = useTemporalStore();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [layingOut, setLayingOut] = useState(false);
  const [scramSearching, setScramSearching] = useState(false);

  useEffect(() => {
    setCanUndo(temporal.getState().pastStates.length > 0);
    setCanRedo(temporal.getState().futureStates.length > 0);
    return temporal.subscribe((state) => {
      setCanUndo(state.pastStates.length > 0);
      setCanRedo(state.futureStates.length > 0);
    });
  }, [temporal]);

  useEffect(() => {
    (async () => {
      // A manually-picked path (persisted across launches) takes priority
      // over PATH auto-detection — re-validated on every launch in case
      // the install it points at moved or was removed since it was set.
      const manual = loadManualScramPath();
      if (manual && (await validateScramBinary(manual))) {
        setScramBinary(manual);
        setScramAvailable(true);
        setScramSource("manual");
        return;
      }
      if (manual) saveManualScramPath(null); // stale — clear it rather than keep re-checking a dead path

      // The SCRAM CLI bundled inside the app itself — a known-good build,
      // so no validation call needed, and it takes priority over a bare
      // PATH search: this is what makes the app work with zero setup.
      const bundled = await getBundledScramPath();
      if (bundled) {
        setScramBinary(bundled);
        setScramAvailable(true);
        setScramSource("bundled");
        return;
      }

      const path = await detectScramBinary();
      setScramBinary(path);
      setScramAvailable(Boolean(path));
      setScramSource(path ? "auto" : null);
    })();
  }, [setScramBinary, setScramAvailable, setScramSource]);

  const selectScramFolder = async () => {
    if (!isTauriEnv()) {
      toast({
        title: "Not available",
        description: "Selecting a SCRAM location requires the desktop app.",
        variant: "destructive",
      });
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true, multiple: false });
    if (!folder || Array.isArray(folder)) return;

    setScramSearching(true);
    const found = await findScramInFolder(folder).finally(() => setScramSearching(false));
    if (found) {
      saveManualScramPath(found);
      setScramBinary(found);
      setScramAvailable(true);
      setScramSource("manual");
      toast({ title: "SCRAM CLI located", description: found, variant: "success" });
    } else {
      toast({
        title: "SCRAM CLI not found",
        description: `No working scram/scram-cli executable found in ${folder}.`,
        variant: "destructive",
      });
    }
  };

  const resetScramToAuto = async () => {
    saveManualScramPath(null);
    const bundled = await getBundledScramPath();
    if (bundled) {
      setScramBinary(bundled);
      setScramAvailable(true);
      setScramSource("bundled");
      toast({ title: "Using bundled SCRAM CLI", description: bundled, variant: "success" });
      return;
    }
    const path = await detectScramBinary();
    setScramBinary(path);
    setScramAvailable(Boolean(path));
    setScramSource(path ? "auto" : null);
    toast({
      title: path ? "Auto-detected SCRAM CLI" : "No SCRAM CLI found on PATH",
      description: path ?? "Falling back to the built-in engine.",
      variant: path ? "success" : "destructive",
    });
  };

  const fitView = () => requestAnimationFrame(() => rf.fitView({ duration: 400, padding: 0.15 }));

  const handleAutoLayout = async () => {
    setLayingOut(true);
    try {
      const positioned = await layoutTree(nodes, edges, compactView);
      applyLayout(positioned);
      fitView();
    } finally {
      setLayingOut(false);
    }
  };

  const handleToggleCompactView = async () => {
    toggleCompactView();
    // Read fresh state (not the values captured in this render's closure)
    // so the re-layout picks up the just-toggled size preset immediately.
    const { nodes: freshNodes, edges: freshEdges, compactView: freshCompact } = useFTAStore.getState();
    const positioned = await layoutTree(freshNodes, freshEdges, freshCompact);
    applyLayout(positioned);
    fitView();
  };

  const executeRun = async () => {
    if (hasBlockingErrors) {
      // The model — including every transfer tree it reaches — has
      // structural errors (a broken sub-tree, an unresolved transfer, a
      // cycle, …). Running against it would silently hand back numbers
      // computed from an invalid tree, so refuse instead.
      toast({
        title: "Cannot run analysis",
        description: "The model has validation errors (see the Validation panel) — this includes errors inside transfer trees, not just the tab you're on.",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    try {
      const { main, all } = getTreeSources();
      const combined = buildCombinedTree(main, all);
      // Read fresh from the store rather than the `runOptions` closed over
      // by this render — a caller that just called `setRunOptions(...)`
      // immediately before `executeRun()` (e.g. the Results tab's mission-
      // time "Recalculate" control) would otherwise run against the stale
      // pre-update value, since Zustand's synchronous `set()` doesn't
      // retroactively update an already-created closure.
      const freshRunOptions = useFTAStore.getState().runOptions;
      const ccfGroups = useFTAStore.getState().ccfGroups;
      const outcome = await runAnalysis(combined.nodes, combined.edges, freshRunOptions, scramBinaryPath, ccfGroups);

      if (outcome.cancelled) {
        toast({ title: "Analysis stopped", description: "Run cancelled — no results to show.", variant: "default" });
        return;
      }

      setResults(outcome.results);

      // scramBinaryPath is only ever non-null once a real SCRAM CLI was
      // detected, so builtin-engine output despite that means SCRAM was
      // attempted and failed mid-run (not just "not installed") — surface
      // that distinctly instead of reporting it as a plain success.
      if (outcome.engineSource === "builtin" && scramBinaryPath) {
        if (outcome.rawStderr) console.error("[SCRAM CLI stderr]", outcome.rawStderr);

        if (outcome.brokenScramInstall) {
          // The configured binary's install is missing its schema files —
          // this will fail identically on every future run, so don't just
          // report it and leave the same broken path selected. Drop it and
          // fall back to the bundled binary (mirrors `resetScramToAuto`,
          // guaranteed to work — it's what shipped with the app) or PATH
          // auto-detection, so the *next* run has a real chance to use
          // SCRAM CLI instead of failing the same way again.
          saveManualScramPath(null);
          const bundledFallback = await getBundledScramPath();
          const autoPath = bundledFallback ?? (await detectScramBinary());
          setScramBinary(autoPath);
          setScramAvailable(Boolean(autoPath));
          setScramSource(autoPath ? (bundledFallback ? "bundled" : "auto") : null);
          toast({
            title: "SCRAM CLI install is broken — switched to built-in engine",
            description: autoPath
              ? `That SCRAM install is missing its schema files. Auto-detected a working one at ${autoPath} for next time.`
              : "That SCRAM install is missing its schema files, and no other SCRAM CLI was found on PATH. Re-select its location from the status bar, or keep using the built-in engine.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "SCRAM CLI failed — used built-in engine instead",
            description: outcome.results.warnings[0] ?? "See the browser console for SCRAM's stderr.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Analysis complete",
          description: `Engine: ${outcome.engineSource === "scram-cli" ? "SCRAM CLI" : "Built-in"} • ${outcome.results.cutSets.length} cut sets`,
          variant: "success",
        });
      }
    } catch (err) {
      // A resource-limit failure gets its own dedicated modal (with node
      // count / what limit was hit) instead of a generic toast — the point
      // is to explain clearly enough that the user can actually act on it
      // (raise cut-off, lower limit-order, try SCRAM CLI), not just report
      // that something went wrong.
      if (err instanceof AnalysisResourceLimitError) {
        setResourceLimitError({ message: err.message, nodeCount: err.nodeCount, detail: err.detail });
        return;
      }
      toast({
        title: "Analysis failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  /** Stops a running analysis — kills the SCRAM child process on the Rust
   * side (see `cancel_scram`) if that's what's running, or terminates the
   * built-in engine's Web Worker (see `engineWorkerClient.ts`) if that is.
   * Either way `runAnalysis` resolves/rejects promptly with a cancelled
   * outcome, so `executeRun`'s own `finally` still clears `isRunning`. This
   * is only reachable at all — i.e. the Stop button is clickable and this
   * handler runs promptly — because the built-in engine now computes off
   * the main thread; it used to block the whole UI thread synchronously,
   * so there was no way to even click Stop while it ran. */
  const cancelRun = async () => {
    await cancelActiveRun();
  };

  const handleImport = async () => {
    try {
      const file = await openXmlFile();
      if (!file) return;
      const parsed = parseOpenPsaXml(file.text);
      const idMap = new Map<string, string>();
      const newNodes: FTANode[] = parsed.nodes.map((n) => {
        const rfId = nextNodeId(n.category === "gate" ? "G" : "E");
        idMap.set(n.id, rfId);
        return {
          id: rfId,
          type: n.category === "gate" ? "gate" : "event",
          position: { x: n.x ?? 0, y: n.y ?? 0 },
          data: {
            label: n.label,
            identifier: n.identifier,
            category: n.category,
            gateType: n.gateType,
            votingK: n.votingK,
            votingMax: n.votingMax,
            eventKind: n.eventKind,
            probability: n.probability,
            description: n.description,
          },
        };
      });
      const newEdges: FTAEdge[] = parsed.edges.map((e) => ({
        id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        sourceHandle: "out",
        targetHandle: "in",
        type: "orthogonal",
      }));
      loadModel(newNodes, newEdges);
      setCcfGroups(parsed.ccfGroups);

      // `some`, not `every` — a shared event now imports as several node
      // instances (see parser.ts's `ensureEventNode`), and only the first
      // one can ever carry the file's `fta-x`/`fta-y` position, so a tree
      // with any repeated event always has a node without one even when
      // every gate has its own saved position. Auto-layout repositions the
      // whole tree regardless, so triggering it on "any node needs it"
      // rather than "literally all of them do" is strictly more correct.
      const needsLayout = parsed.nodes.some((n) => n.x === undefined && n.y === undefined);
      if (needsLayout) {
        const positioned = await layoutTree(newNodes, newEdges);
        applyLayout(positioned);
      }
      fitView();
      setDocument(file.name, "openpsa-xml", file.path);
      toast({ title: "Model imported", description: file.name, variant: "success" });
    } catch (err) {
      // A failed parse must never touch `documentName` — the in-memory
      // model (and whatever document it was already associated with, if
      // any) is untouched, so the title bar/menu strip shouldn't imply
      // otherwise either.
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleImportJson = async () => {
    try {
      const file = await openJsonFile();
      if (!file) return;
      const payload = parseModelJson(file.text);

      // `payload.tabs` is this app's own "every tab, including whichever
      // one was active" shape (see `getTreeSources`'s `all`) — but
      // `restoreSession` expects the active tab's nodes/edges split out
      // separately from the *parked*-only tab list (matching how
      // `state.tabs` is shaped everywhere else, and how the crash-recovery
      // autosave snapshot already restores above).
      const activeTab = payload.tabs.find((t) => t.id === payload.activeTabId)!;
      const parkedTabs = payload.tabs.filter((t) => t.id !== payload.activeTabId);

      restoreSession(activeTab.nodes, activeTab.edges, parkedTabs, payload.activeTabId, payload.activeTabName, file.name, "json", file.path);
      setCcfGroups(payload.ccfGroups);
      setRunOptions(payload.runOptions);
      setResults(payload.results);
      fitView();
      toast({ title: "Model imported", description: file.name, variant: "success" });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  /** Every export previously gave zero feedback on success — the file
   * genuinely got written (or the dialog genuinely got cancelled), but
   * there was nothing on screen to tell those two apart, so a save could
   * silently do nothing (a cancelled dialog) and look identical to it
   * quietly working. `fn` returns whether it actually saved (`false` for
   * a cancelled dialog — see `exportDiagram.ts`/`exportReport.ts`'s own
   * doc comments), and only that case gets the success toast; a cancel
   * gets neither toast, matching how cancelling any other dialog in this
   * app is a silent no-op rather than an "error". */
  const withExportToast = (successTitle: string, fn: () => Promise<boolean>) => async () => {
    try {
      const saved = await fn();
      if (saved) toast({ title: successTitle, variant: "success" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  /** Returns whether a save actually happened — used both by the plain
   * "Export" menu items (which ignore it) and by the close-window "unsaved
   * changes" dialog's Save button, which must NOT proceed with closing if
   * the user cancels the native save dialog partway through.
   *
   * `saveAs`: `false` (the default — plain "Save", Ctrl+S/Ctrl+Shift+S) —
   * writes straight to the already-tracked path with no dialog, same as
   * every conventional editor's quick-save, *if* this document is already
   * associated with a real file of the matching format. Otherwise (a
   * never-saved "Untitled" document, or the tracked document is the other
   * format) there's nowhere to quick-save to, so it falls back to Save As
   * regardless. `true` (the File menu's explicit "Save As" items, which
   * deliberately have no shortcut) always prompts — for making a new copy
   * without disturbing the file already open. */
  const handleExportXml = async (saveAs = false): Promise<boolean> => {
    try {
      const { main, all } = getTreeSources();
      const combined = buildCombinedTree(main, all);
      const xml = serializeToOpenPsaXml(combined.nodes, combined.edges, {
        ccfGroups: useFTAStore.getState().ccfGroups,
      });

      if (!saveAs && documentKind === "openpsa-xml" && documentPath) {
        await writeTextFileAt(documentPath, xml);
        setDirty(false);
        toast({ title: "Saved", description: documentName ?? undefined, variant: "success" });
        return true;
      }

      // Only reuse the tracked name as a suggestion when it's already an
      // XML document — reusing a `.json` project's name here would
      // suggest the wrong extension for this export.
      const suggestedName = documentKind === "openpsa-xml" && documentName ? documentName : "fault-tree.xml";
      const saved = await saveXmlFile(xml, suggestedName);
      if (!saved) return false;
      setDocument(saved.name, "openpsa-xml", saved.path);
      setDirty(false);
      toast({ title: saveAs ? "Saved as" : "Saved", description: saved.name, variant: "success" });
      return true;
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return false;
    }
  };

  const handleExportJson = async (saveAs = false): Promise<boolean> => {
    try {
      if (!saveAs && documentKind === "json" && documentPath) {
        await exportModelJson(documentName ?? undefined, documentPath);
        setDirty(false);
        toast({ title: "Saved", description: documentName ?? undefined, variant: "success" });
        return true;
      }

      const suggestedName = documentKind === "json" && documentName ? documentName : "fault-tree-full.json";
      const saved = await exportModelJson(suggestedName);
      if (!saved) return false;
      setDocument(saved.name, "json", saved.path);
      setDirty(false);
      toast({ title: saveAs ? "Saved as" : "Saved", description: saved.name, variant: "success" });
      return true;
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return false;
    }
  };

  const handleExportDiagramPng = withExportToast("Diagram exported as PNG", () =>
    exportDiagramPng({ nodes, edges, gateLabelStyle, nodeDisplay, compact: compactView })
  );
  const handleExportDiagramSvg = withExportToast("Diagram exported as SVG", () =>
    exportDiagramSvg({ nodes, edges, gateLabelStyle, nodeDisplay, compact: compactView })
  );
  const handleExportReportXml = withExportToast("Report exported as XML", async () => {
    if (!results) return false;
    return exportReportXml(results, "fault-tree");
  });
  const handleExportReportPdf = withExportToast("Report exported as PDF", async () => {
    if (!results) return false;
    return exportReportPdf(results, "fault-tree");
  });

  const handleNewModel = () => {
    resetModel(); // already clears documentName/documentKind — see ftaStore.ts
    fitView();
    // An intentionally-discarded model shouldn't come back as a "restore
    // unsaved work?" prompt on next launch.
    void clearSnapshot();
  };

  return {
    rf,
    theme,
    toggleTheme,
    isRunning,
    documentName,
    documentKind,
    documentPath,
    hasBlockingErrors,
    scramAvailable,
    scramBinaryPath,
    scramSource,
    scramLocationDialogOpen,
    setScramLocationDialogOpen,
    selectScramFolder,
    resetScramToAuto,
    scramSearching,
    results,
    runOptions,
    setRunOptions,
    canUndo,
    canRedo,
    layingOut,
    undo: () => temporal.getState().undo(),
    redo: () => temporal.getState().redo(),
    handleAutoLayout,
    compactView,
    handleToggleCompactView,
    executeRun,
    cancelRun,
    handleImport,
    handleImportJson,
    handleExportXml,
    handleExportJson,
    handleNewModel,
    exportDiagramPng: handleExportDiagramPng,
    exportDiagramSvg: handleExportDiagramSvg,
    exportReportXml: handleExportReportXml,
    exportReportPdf: handleExportReportPdf,
  };
}
