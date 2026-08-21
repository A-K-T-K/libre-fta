import { useEffect, useRef } from "react";
import { useFTAStore } from "@/store/ftaStore";
import { useAutoArrange } from "@/hooks/useAutoArrange";
import { useDeleteNode } from "@/hooks/useDeleteNode";
import { useAppActions } from "@/hooks/useAppActions";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/** App-level keyboard shortcuts — Ctrl+Z/Ctrl+Y/Ctrl+R were previously only
 * decorative labels in MenuBar with no listener behind them. Store actions
 * are read fresh via `getState()` on each keypress rather than subscribed
 * to, so the listener itself never goes stale and the effect below never
 * needs to re-run just because some unrelated state changed. The
 * import/export handlers (`useAppActions()`) can't use that same trick —
 * they're plain functions recreated every render, not store actions
 * reachable via `getState()` — so they're stashed in a ref, updated on
 * every render but never listed as an effect dependency, for the same
 * "the listener itself stays stable" effect without going stale either. */
export function useKeyboardShortcuts() {
  const autoArrange = useAutoArrange();
  const deleteNode = useDeleteNode();
  const actions = useAppActions();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        useFTAStore.temporal.getState().undo();
        return;
      }

      if (ctrlOrCmd && ((e.shiftKey && e.key.toLowerCase() === "z") || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        useFTAStore.temporal.getState().redo();
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === "r") {
        // Ctrl+R is browser-refresh in the no-Tauri dev-server fallback —
        // always prevent that, whether or not the dialog actually opens.
        e.preventDefault();
        const { isRunning, lintIssues, setRunDialogOpen } = useFTAStore.getState();
        const hasBlockingErrors = lintIssues.some((i) => i.severity === "error");
        if (!isRunning && !hasBlockingErrors) setRunDialogOpen(true);
        return;
      }

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "n") {
        // Ctrl+N is browser-new-window outside Tauri — always prevent it.
        // Goes through the same confirmation dialog the File menu's "New
        // Model" item does (now with its own Save option), not a silent
        // reset — a keyboard shortcut is not implicit permission to
        // discard unsaved work.
        e.preventDefault();
        useFTAStore.getState().setNewModelConfirmOpen(true);
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === "o") {
        // Ctrl+O is browser-open-file outside Tauri — always prevent it.
        // Shift picks the format: Open-PSA MEF (the "real" model this app
        // is fundamentally about) needs the modifier since it's the
        // format most existing files out in the world will be in and
        // thus the one most likely to be opened repeatedly; plain Ctrl+O
        // is this app's own full-fidelity JSON dump.
        e.preventDefault();
        if (e.shiftKey) void actionsRef.current.handleImport();
        else void actionsRef.current.handleImportJson();
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === "s") {
        // Ctrl+S is browser-save-page outside Tauri — always prevent it.
        // Same shift-picks-the-format split as Ctrl+O above, mirrored for
        // symmetry (plain = JSON, shifted = Open-PSA MEF).
        e.preventDefault();
        if (e.shiftKey) void actionsRef.current.handleExportXml();
        else void actionsRef.current.handleExportJson();
        return;
      }

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        useFTAStore.getState().setExportPickerOpen(true);
        return;
      }

      // React Flow's own `deleteKeyCode` handling is disabled
      // (FaultTreeCanvas.tsx) since it doesn't cascade to descendants or
      // warn before orphaning a subtree — this is the one delete path now,
      // shared with the context menus' "Delete" items (useDeleteNode).
      if (!ctrlOrCmd && !e.altKey && (e.key === "Delete" || e.key === "Backspace")) {
        const { selectedIds } = useFTAStore.getState();
        if (selectedIds.length === 0) return;
        e.preventDefault();
        deleteNode(selectedIds);
        return;
      }

      if (!ctrlOrCmd && !e.altKey && e.key.toLowerCase() === "e") {
        const { selectedIds, nodes, addChildEvent } = useFTAStore.getState();
        if (selectedIds.length !== 1) return;
        const node = nodes.find((n) => n.id === selectedIds[0]);
        if (!node || node.data.category !== "gate") return;
        e.preventDefault();
        addChildEvent(node.id, "basic");
        void autoArrange();
        return;
      }

      if (!ctrlOrCmd && !e.altKey && e.key.toLowerCase() === "g") {
        const { selectedIds, nodes, edges, addChildGate } = useFTAStore.getState();
        if (selectedIds.length !== 1) return;
        const node = nodes.find((n) => n.id === selectedIds[0]);
        if (!node) return;
        const isBox = node.data.category === "top" || node.data.eventKind === "intermediate";
        if (!isBox) return;
        const childCount = edges.filter((ed) => ed.target === node.id).length;
        if (childCount > 0) return;
        e.preventDefault();
        addChildGate(node.id, "or");
        void autoArrange();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoArrange, deleteNode]);
}
