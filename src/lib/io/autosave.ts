import { isTauriEnv } from "@/lib/scram/runner";
import type { FTANode, FTAEdge, TreeTab } from "@/store/ftaStore";

export interface AutosaveSnapshot {
  nodes: FTANode[];
  edges: FTAEdge[];
  tabs: TreeTab[];
  activeTabId: string;
  activeTabName: string;
  savedAt: string;
  /** The document name/kind shown in the title bar and menu strip — carried
   * through crash recovery so a restored session doesn't silently drop back
   * to "Untitled". Optional so an older autosave file written before this
   * field existed still parses (`JSON.parse` just leaves it `undefined`,
   * which `restoreSession` already treats as "no document"). */
  documentName?: string | null;
  documentKind?: "openpsa-xml" | "json" | null;
  documentPath?: string | null;
}

const STORAGE_KEY = "fta-autosave";
const FILE_NAME = "autosave.json";

async function tauriFilePath(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  return join(await appDataDir(), FILE_NAME);
}

/** Autosave is a convenience, never a critical path — any failure here
 * (missing permission, disk full, a locked file) is swallowed rather than
 * thrown, so it can never surface as an uncaught error or interrupt
 * whatever the user was actually doing (e.g. "New Model", which just wants
 * to clear the old snapshot as a courtesy, not block on it). */
export async function saveSnapshot(snapshot: AutosaveSnapshot): Promise<void> {
  const text = JSON.stringify(snapshot);
  if (isTauriEnv()) {
    try {
      const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const { appDataDir } = await import("@tauri-apps/api/path");
      // The app-data directory doesn't exist until something writes to it —
      // create it up front so the very first autosave doesn't fail.
      await mkdir(await appDataDir(), { recursive: true }).catch(() => {});
      await writeTextFile(await tauriFilePath(), text);
    } catch {
      // Best-effort — see comment above.
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Best-effort — see comment above.
  }
}

export async function loadSnapshot(): Promise<AutosaveSnapshot | null> {
  let raw: string | null = null;
  try {
    if (isTauriEnv()) {
      const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
      const path = await tauriFilePath();
      if (await exists(path)) raw = await readTextFile(path);
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AutosaveSnapshot;
  } catch {
    return null;
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    if (isTauriEnv()) {
      const { remove, exists } = await import("@tauri-apps/plugin-fs");
      const path = await tauriFilePath();
      if (await exists(path)) await remove(path);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort — see comment above saveSnapshot.
  }
}
