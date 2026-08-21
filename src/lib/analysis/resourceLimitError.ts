/** Thrown by either analysis path (the built-in engine's combinatorial cut-set
 * enumeration, or the SCRAM CLI report being too large to safely parse — see
 * `runner.ts`'s `ScramOutputTooLargeError`, which extends this) when a run
 * would risk exhausting memory before producing a result. Caught by
 * `useAppActions.ts`'s `executeRun` and shown as a dedicated "can't run this
 * safely" modal instead of a generic failure toast, with enough detail
 * (node count, what limit was hit) for the user to actually act on it —
 * tightening the cut-off/limit-order in Run Options, or simplifying the
 * model. */
export class AnalysisResourceLimitError extends Error {
  readonly nodeCount: number;
  readonly detail: string;

  constructor(message: string, nodeCount: number, detail: string) {
    super(message);
    this.nodeCount = nodeCount;
    this.detail = detail;
    this.name = "AnalysisResourceLimitError";
  }
}
