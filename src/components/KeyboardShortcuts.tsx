import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

/** Mounted once, always, inside `ReactFlowProvider` — `useAutoArrange`
 * (which the shortcut hook calls) needs a React Flow context, and the
 * canvas itself isn't always mounted (the Results tab swaps it out), so
 * this can't just live inside `FaultTreeCanvas`. */
export function KeyboardShortcuts() {
  useKeyboardShortcuts();
  return null;
}
