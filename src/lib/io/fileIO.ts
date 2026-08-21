import { isTauriEnv } from "@/lib/scram/runner";

export interface OpenedFile {
  text: string;
  name: string;
  /** Full filesystem path — `null` outside Tauri (the browser's file input
   * never exposes one). Callers use this to back a later dialog-free
   * "Save" (write straight back to the same path), as opposed to "Save
   * As" (always prompts). */
  path: string | null;
}

async function openTextFile(
  filterName: string,
  extensions: string[],
  accept: string,
  fallbackName: string
): Promise<OpenedFile | null> {
  if (isTauriEnv()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      multiple: false,
      filters: [{ name: filterName, extensions }],
    });
    if (!path || Array.isArray(path)) return null;
    const text = await readTextFile(path);
    const name = path.split(/[\\/]/).pop() ?? fallbackName;
    return { text, name, path };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve({ text, name: file.name, path: null });
    };
    input.click();
  });
}

export async function openXmlFile(): Promise<OpenedFile | null> {
  return openTextFile("Open-PSA MEF", ["xml"], ".xml,application/xml,text/xml", "model.xml");
}

export async function openJsonFile(): Promise<OpenedFile | null> {
  return openTextFile("JSON", ["json"], ".json,application/json", "model.json");
}

export interface SavedFile {
  name: string;
  /** Full filesystem path — `null` outside Tauri, same as `OpenedFile`. */
  path: string | null;
}

/** Resolves to the actual saved file's name/path — which may differ from
 * `suggestedName` if the user changed it in the save dialog — or `null` if
 * the user cancelled without saving. Callers use this to know whether (and
 * to what) they should update the tracked "current document", and to back
 * a later dialog-free "Save" via `writeTextFileAt` below. */
async function saveTextFile(
  text: string,
  suggestedName: string,
  filterName: string,
  extensions: string[],
  mimeType: string
): Promise<SavedFile | null> {
  if (isTauriEnv()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: filterName, extensions }],
    });
    if (!path) return null;
    await writeTextFile(path, text);
    return { name: path.split(/[\\/]/).pop() ?? suggestedName, path };
  }

  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  // The browser's own save-as dialog runs outside any API we can observe —
  // there's no way to tell whether the user actually kept the download or
  // cancelled it, nor what name they picked if they changed it. Assume the
  // suggested name, same best-effort tradeoff `openXmlFile`'s browser
  // fallback already makes for the reverse (import) direction. No real
  // path either way — every browser "save" is a fresh download, never a
  // dialog-free rewrite of an existing file.
  return { name: suggestedName, path: null };
}

export async function saveXmlFile(text: string, suggestedName: string): Promise<SavedFile | null> {
  return saveTextFile(text, suggestedName, "Open-PSA MEF", ["xml"], "application/xml");
}

export async function saveJsonFile(text: string, suggestedName: string): Promise<SavedFile | null> {
  return saveTextFile(text, suggestedName, "JSON", ["json"], "application/json");
}

/** Writes straight to an already-known path — no dialog. Backs the plain
 * "Save" behavior (Ctrl+S/Ctrl+Shift+S) once a document already has a
 * tracked path, matching every conventional editor: the *first* save (or
 * an explicit "Save As") always asks where, every save after that just
 * writes back to the same file. Tauri-only by construction — there's no
 * such thing as a dialog-free file write in a browser tab. */
export async function writeTextFileAt(path: string, text: string): Promise<void> {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(path, text);
}
