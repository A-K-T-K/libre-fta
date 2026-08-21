const STORAGE_KEY = "fta-scram-manual-path";

/** A manually-picked SCRAM binary path persists across launches so the
 * user only has to point at their install once — checked before falling
 * back to PATH auto-detection (see useAppActions.ts's init effect). */
export function loadManualScramPath(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveManualScramPath(path: string | null): void {
  try {
    if (path) localStorage.setItem(STORAGE_KEY, path);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — worst case the manual pick just doesn't survive a restart.
  }
}
