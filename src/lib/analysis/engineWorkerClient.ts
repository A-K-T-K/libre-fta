import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { AnalysisResults, CcfGroup, RunOptions } from "@/types/fta";
import { AnalysisResourceLimitError } from "@/lib/analysis/resourceLimitError";
import EngineWorker from "@/lib/analysis/engine.worker?worker";

/** Thrown when the Stop button terminates an in-flight built-in-engine
 * worker — mirrors the SCRAM-CLI-cancellation shape in `runner.ts`
 * (`RunOutcome.cancelled`) so both engines' Stop button behave identically
 * to the caller. */
export class BuiltinEngineCancelledError extends Error {
  constructor() {
    super("Built-in engine run cancelled.");
    this.name = "BuiltinEngineCancelledError";
  }
}

// At most one analysis ever runs at a time (`isRunning` in the store already
// enforces this), so a single module-level slot is enough to let the Stop
// button reach in and terminate whatever's currently computing. `reject` is
// stashed alongside the worker so cancellation can settle the still-pending
// promise (terminating a worker doesn't fire `onmessage`/`onerror` — the
// promise would otherwise hang forever).
let active: { worker: Worker; reject: (err: Error) => void } | null = null;

/** Runs the built-in JS analysis engine on a background thread (a Web
 * Worker) instead of the main/render thread. The engine's cut-set
 * enumeration and Monte Carlo sampling are synchronous, CPU-bound loops
 * that can run for seconds on a large tree — previously this ran directly
 * on the main thread (`analyzeFaultTree(...)` called straight from
 * `runner.ts`), which froze the whole UI for that entire duration: no
 * re-renders, no click events, not even the Stop button itself could be
 * clicked. Moving it into a worker keeps the UI thread free the whole time,
 * and gives the Stop button something real to do (`cancelBuiltinEngineRun`
 * below just terminates the worker outright — safe, since it holds no
 * shared state and touches nothing outside its own message). */
export function runBuiltinEngine(
  nodes: FTANode[],
  edges: FTAEdge[],
  options: RunOptions,
  ccfGroups: CcfGroup[]
): Promise<AnalysisResults> {
  return new Promise((resolve, reject) => {
    const worker = new EngineWorker();
    active = { worker, reject };

    const cleanup = () => {
      if (active?.worker === worker) active = null;
      worker.terminate();
    };

    worker.onmessage = (event) => {
      const data = event.data as
        | { ok: true; results: AnalysisResults }
        | { ok: false; resourceLimit: true; message: string; nodeCount: number; detail: string }
        | { ok: false; resourceLimit: false; message: string };
      cleanup();
      if (data.ok) {
        resolve(data.results);
      } else if (data.resourceLimit) {
        reject(new AnalysisResourceLimitError(data.message, data.nodeCount, data.detail));
      } else {
        reject(new Error(data.message));
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Built-in engine worker crashed."));
    };

    worker.postMessage({ nodes, edges, options, ccfGroups });
  });
}

/** Backs the Stop button while the built-in engine is running. Returns
 * `true` if a run was actually in flight and got cancelled, `false` if
 * there was nothing to cancel (mirrors `cancelScramRun`'s return shape). */
export function cancelBuiltinEngineRun(): boolean {
  if (!active) return false;
  const { worker, reject } = active;
  active = null;
  worker.terminate();
  reject(new BuiltinEngineCancelledError());
  return true;
}
