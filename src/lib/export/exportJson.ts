import { getTreeSources, useFTAStore } from "@/store/ftaStore";
import { saveJsonFile, writeTextFileAt, type SavedFile } from "@/lib/io/fileIO";

/** Full-fidelity snapshot of the whole session — every tab (main tree plus
 * every parked transfer tree, not just the merged/combined view used for
 * analysis), CCF groups, run options, and the last analysis results if
 * any. Unlike the Open-PSA MEF export (which only round-trips the tree
 * structure SCRAM itself understands), this is meant to capture
 * everything the app itself knows about the model in one file. */
export interface FullModelExport {
  formatVersion: 1;
  exportedAt: string;
  activeTabId: string;
  activeTabName: string;
  tabs: ReturnType<typeof getTreeSources>["all"];
  ccfGroups: ReturnType<typeof useFTAStore.getState>["ccfGroups"];
  runOptions: ReturnType<typeof useFTAStore.getState>["runOptions"];
  results: ReturnType<typeof useFTAStore.getState>["results"];
}

/** `existingPath`, when given, writes straight there with no dialog — the
 * plain "Save" behavior once a JSON document is already associated with a
 * real file. Omit it (or pass `null`) for "Save As", which always prompts;
 * that's also what happens automatically for a never-saved ("Untitled")
 * document even if the caller *meant* a quick save, since there's nowhere
 * to quick-save to yet. */
export async function exportModelJson(
  suggestedName = "fault-tree-full.json",
  existingPath?: string | null
): Promise<SavedFile | null> {
  const state = useFTAStore.getState();
  const { all } = getTreeSources();
  const payload: FullModelExport = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    activeTabId: state.activeTabId,
    activeTabName: state.activeTabName,
    tabs: all,
    ccfGroups: state.ccfGroups,
    runOptions: state.runOptions,
    results: state.results,
  };
  const text = JSON.stringify(payload, null, 2);
  if (existingPath) {
    await writeTextFileAt(existingPath, text);
    return { name: existingPath.split(/[\\/]/).pop() ?? suggestedName, path: existingPath };
  }
  return saveJsonFile(text, suggestedName);
}

/** Parses (and lightly validates) a file previously written by
 * `exportModelJson` — just enough structural checking to fail with a clear
 * message on a malformed/unrelated JSON file rather than a confusing
 * downstream crash once the store tries to use it. Doesn't validate node/
 * edge shapes as deeply as the Open-PSA MEF importer's zod schema does
 * (`parser.ts`'s `parsedModelSchema`) — this format is this app's own
 * lossless dump of its own state, not a third-party interchange format
 * users hand-author, so the realistic failure mode is "picked the wrong
 * file" rather than "subtly malformed content". */
export function parseModelJson(text: string): FullModelExport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Not a valid full-model JSON file.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.formatVersion !== 1) {
    throw new Error(`Unsupported format version (${String(obj.formatVersion)}) — this file wasn't exported by this version of LibRE FTA.`);
  }
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) {
    throw new Error("Missing or empty 'tabs' — not a valid full-model JSON file.");
  }
  if (typeof obj.activeTabId !== "string" || typeof obj.activeTabName !== "string") {
    throw new Error("Missing 'activeTabId'/'activeTabName' — not a valid full-model JSON file.");
  }
  if (!obj.tabs.some((t) => (t as { id?: unknown }).id === obj.activeTabId)) {
    throw new Error(`'activeTabId' ("${obj.activeTabId}") doesn't match any tab in the file.`);
  }
  return raw as FullModelExport;
}
