import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { WarningRegular as AlertOctagon } from "@fluentui/react-icons";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import { MenuBar } from "@/components/toolbar/MenuBar";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { TabBar } from "@/components/panels/TabBar";
import { FaultTreeCanvas } from "@/components/canvas/FaultTreeCanvas";
import { Inspector } from "@/components/panels/Inspector";
import { LintPanel } from "@/components/panels/LintPanel";
import { TreeView } from "@/components/panels/TreeView";
import { CcfGroupsPanel } from "@/components/panels/CcfGroupsPanel";
import { StatusBar } from "@/components/panels/StatusBar";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ResourceLimitDialog } from "@/components/ResourceLimitDialog";
import { SaveDiscardCancelDialog } from "@/components/SaveDiscardCancelDialog";
import { ExportPickerDialog } from "@/components/ExportPickerDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFTAStore, getTreeSources } from "@/store/ftaStore";
import { validateCombinedTree } from "@/lib/analysis/combineTree";
import { saveSnapshot, loadSnapshot, clearSnapshot, type AutosaveSnapshot } from "@/lib/io/autosave";
import { getMemoryUsage, isTauriEnv } from "@/lib/scram/runner";
import { useAppActions } from "@/hooks/useAppActions";

function App() {
  const nodes = useFTAStore((s) => s.nodes);
  const edges = useFTAStore((s) => s.edges);
  const tabs = useFTAStore((s) => s.tabs);
  const activeTabId = useFTAStore((s) => s.activeTabId);
  const activeTabName = useFTAStore((s) => s.activeTabName);
  const restoreSession = useFTAStore((s) => s.restoreSession);
  const lintIssues = useFTAStore((s) => s.lintIssues);
  const setLintIssues = useFTAStore((s) => s.setLintIssues);
  const mainView = useFTAStore((s) => s.mainView);
  const showLeftPanel = useFTAStore((s) => s.showLeftPanel);
  const showRightPanel = useFTAStore((s) => s.showRightPanel);
  const ccfGroups = useFTAStore((s) => s.ccfGroups);
  const setMemoryUsageBytes = useFTAStore((s) => s.setMemoryUsageBytes);
  const documentName = useFTAStore((s) => s.documentName);
  const documentKind = useFTAStore((s) => s.documentKind);
  const documentPath = useFTAStore((s) => s.documentPath);

  const [pendingSnapshot, setPendingSnapshot] = useState<AutosaveSnapshot | null>(null);
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(224);
  const resizing = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setSidebarWidth(Math.min(480, Math.max(180, e.clientX)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Suppresses the native browser/webview right-click menu everywhere —
  // this is a desktop app, not a web page, so "Back", "Reload", "Inspect"
  // etc. showing up on right-click reads as broken chrome. The app's own
  // custom context menus (node right-click menus, built on Fluent UI's
  // `<Menu openOnContext>`) already suppress the native menu themselves
  // wherever they're the trigger target; this just covers everywhere else
  // (canvas background, panels, empty space) where no custom menu exists.
  // Registered on `document` in the bubble phase and never calling
  // `stopPropagation`, so it runs *after* Fluent's own contextmenu handling
  // rather than intercepting the event before Fluent ever sees it.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    // Validate the whole model — the active tab's live nodes/edges plus
    // every parked transfer-tree tab — not just whatever's on screen right
    // now, so an error buried in an unopened transfer tree still surfaces.
    const id = setTimeout(() => {
      const { main, all } = getTreeSources();
      setLintIssues(validateCombinedTree(main, all, ccfGroups));
    }, 200);
    return () => clearTimeout(id);
  }, [nodes, edges, tabs, ccfGroups, setLintIssues]);

  // Keeps the OS window title (and the browser-tab title in plain dev-server
  // preview) in sync with whatever file this session is currently
  // associated with — mirrors ordinary desktop-app behavior ("file.xml —
  // AppName"), falling back to the app's static default title (set in
  // tauri.conf.json) once there's no document (new/never-saved model).
  // Setting the window title needs `core:window:allow-set-title` explicitly
  // in capabilities/default.json — it's not part of `core:window`'s default
  // permission set (only *reading* the title is).
  useEffect(() => {
    const title = documentName ? `${documentName} — LibRE FTA` : "LibRE FTA — Fault Tree Analysis";
    document.title = title;
    if (!isTauriEnv()) return;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => {
        // Best-effort — an unset title is a cosmetic issue, never worth
        // surfacing to the user.
      });
  }, [documentName]);

  // Polls the app's own process memory for the status bar — a runaway
  // analysis is visible climbing here well before it'd ever hit the
  // resource-limit caps in engine.ts/runner.ts, and it's just useful
  // context to have on screen generally. `getMemoryUsage` already no-ops
  // to `null` outside Tauri, so this is harmless in a plain browser preview.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getMemoryUsage().then((bytes) => {
        if (!cancelled) setMemoryUsageBytes(bytes);
      });
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setMemoryUsageBytes]);

  // Check once, on launch, for a session left behind by a crash or an
  // accidental close (there's no "clean exit" signal to key off of, so any
  // leftover snapshot is treated as recoverable work).
  useEffect(() => {
    loadSnapshot().then((snap) => {
      if (snap) {
        setPendingSnapshot(snap);
        setRestorePromptOpen(true);
      }
    });
  }, []);

  // Debounced crash-recovery snapshot — mirrors the lint-validation effect's
  // shape above. Paused while the restore prompt is open so an unanswered
  // prompt can't get silently overwritten by the just-launched (still
  // default) state before the user has chosen to restore or discard it.
  useEffect(() => {
    if (restorePromptOpen) return;
    const id = setTimeout(() => {
      void saveSnapshot({
        nodes,
        edges,
        tabs,
        activeTabId,
        activeTabName,
        savedAt: new Date().toISOString(),
        documentName,
        documentKind,
        documentPath,
      });
    }, 2000);
    return () => clearTimeout(id);
  }, [nodes, edges, tabs, activeTabId, activeTabName, documentName, documentKind, documentPath, restorePromptOpen]);

  const errorCount = lintIssues.filter((i) => i.severity === "error").length;
  const warningCount = lintIssues.filter((i) => i.severity === "warning").length;

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <ReactFlowProvider>
          <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <MenuBar />
            <Toolbar />
            <div className="flex min-h-0 flex-1">
              {showLeftPanel && (
              <aside
                className="relative flex shrink-0 flex-col border-r border-border bg-card"
                style={{ width: sidebarWidth }}
              >
                <Tabs defaultValue="explorer" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="p-1.5 pb-0">
                    <TabsList className="w-full">
                      <TabsTrigger value="explorer" className="flex-1">
                        Explorer
                      </TabsTrigger>
                      <TabsTrigger value="lint" className="flex-1 gap-1.5">
                        Validation
                        {(errorCount > 0 || warningCount > 0) && (
                          <span className="flex items-center gap-1 text-[10px]">
                            <AlertOctagon className="h-3 w-3 text-destructive" />
                            {errorCount + warningCount}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="ccf" className="flex-1">
                        CCF
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="explorer" className="min-h-0 flex-1 overflow-hidden">
                    <TreeView />
                  </TabsContent>
                  <TabsContent value="lint" className="min-h-0 flex-1 overflow-hidden">
                    <LintPanel />
                  </TabsContent>
                  <TabsContent value="ccf" className="min-h-0 flex-1 overflow-hidden">
                    <CcfGroupsPanel />
                  </TabsContent>
                </Tabs>
                <div
                  onMouseDown={onResizeStart}
                  className="absolute -right-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                />
              </aside>
              )}

              <main className="flex min-w-0 flex-1 flex-col">
                <TabBar />
                <div className="min-h-0 flex-1">
                  {mainView === "diagram" ? <FaultTreeCanvas /> : <ResultsDashboard />}
                </div>
              </main>

              {showRightPanel && (
              <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
                <div className="border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Inspector
                </div>
                <div className="min-h-0 flex-1">
                  <Inspector />
                </div>
              </aside>
              )}
            </div>
            <StatusBar />
          </div>
          <KeyboardShortcuts />
          <DeleteConfirmDialog />
          <ResourceLimitDialog />
          <CloseGuard />
          <ExportPickerDialog />
          <ConfirmDialog
            open={restorePromptOpen}
            onOpenChange={setRestorePromptOpen}
            title="Restore unsaved work?"
            description={
              pendingSnapshot
                ? `An autosaved session from ${new Date(pendingSnapshot.savedAt).toLocaleString()} was found — probably left behind by a crash or an unsaved close. Restore it, or discard it and start from the current model?`
                : ""
            }
            confirmLabel="Restore"
            cancelLabel="Discard"
            onConfirm={() => {
              if (pendingSnapshot) {
                restoreSession(
                  pendingSnapshot.nodes,
                  pendingSnapshot.edges,
                  pendingSnapshot.tabs,
                  pendingSnapshot.activeTabId,
                  pendingSnapshot.activeTabName,
                  pendingSnapshot.documentName,
                  pendingSnapshot.documentKind,
                  pendingSnapshot.documentPath
                );
              }
              setPendingSnapshot(null);
            }}
            onCancel={() => {
              // "Discard" means gone — previously this only cleared the
              // in-memory prompt state and left the actual snapshot file/
              // localStorage entry sitting on disk, so a discarded session
              // kept coming back as a "restore unsaved work?" prompt on
              // every subsequent launch instead of staying discarded.
              void clearSnapshot();
              setPendingSnapshot(null);
            }}
          />
          <Toaster />
        </ReactFlowProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

/** Intercepts the window close request (the OS's X button, Alt+F4, Cmd+Q,
 * …) and warns instead of silently discarding an unsaved model — mirrors
 * every conventional desktop editor's "Save changes before closing?"
 * prompt, which this app previously had no equivalent of at all: closing
 * with real unsaved work just lost it outright (the crash-recovery
 * autosave snapshot is the only safety net, and that requires remembering
 * to restore it next launch rather than just warning up front). Needs
 * `useAppActions()` for the export handlers, which needs `useReactFlow()`,
 * which only works inside `<ReactFlowProvider>` — so this has to be its own
 * component rendered as a child of it, not inlined into `App` itself
 * (`App`'s own render happens *before* the `ReactFlowProvider` it returns
 * takes effect for its children). */
function CloseGuard() {
  const a = useAppActions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTauriEnv()) {
      // Browser preview fallback — no custom UI is possible for
      // `beforeunload` (browsers deliberately ignore any custom message),
      // just the native "leave site?" confirmation.
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!useFTAStore.getState().dirty) return;
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const fn = await win.onCloseRequested((event) => {
        if (!useFTAStore.getState().dirty) return; // nothing to lose — let it close normally
        event.preventDefault();
        setConfirmOpen(true);
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const forceClose = async () => {
    // `.close()` would just re-emit `closeRequested` and loop back into
    // this same handler — `.destroy()` is Tauri's documented way to bypass
    // that and actually close the window.
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
  };

  const handleDiscard = async () => {
    // "Don't Save" means exactly that — leaving the crash-recovery autosave
    // behind would silently contradict the user's own choice, resurrecting
    // the discarded work as a "restore unsaved work?" prompt on next launch
    // (the same bug already fixed for the launch-time Discard button and
    // New Model — this is the third/last place a session can end without
    // saving).
    await clearSnapshot();
    await forceClose();
  };

  const handleSave = async () => {
    setSaving(true);
    const kind = useFTAStore.getState().documentKind;
    const saved = kind === "json" ? await a.handleExportJson() : await a.handleExportXml();
    setSaving(false);
    // A cancelled save dialog resolves `saved` to false — leave the
    // confirmation dialog open so the user can retry Save, or explicitly
    // pick Don't Save/Cancel, rather than silently closing (or silently
    // staying open with no feedback) either way.
    if (saved) {
      setConfirmOpen(false);
      await forceClose();
    }
  };

  return (
    <SaveDiscardCancelDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Save changes before closing?"
      description="This model has unsaved changes. Save them before closing, or they'll be lost."
      discardLabel="Don't Save"
      saving={saving}
      onSave={handleSave}
      onDiscard={handleDiscard}
    />
  );
}

export default App;
