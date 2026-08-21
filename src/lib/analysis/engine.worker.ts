import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { AnalysisResults, CcfGroup, RunOptions } from "@/types/fta";
import { analyzeFaultTree } from "@/lib/analysis/engine";
import { AnalysisResourceLimitError } from "@/lib/analysis/resourceLimitError";

interface AnalyzeRequest {
  nodes: FTANode[];
  edges: FTAEdge[];
  options: RunOptions;
  ccfGroups: CcfGroup[];
}

type WorkerResponse =
  | { ok: true; results: AnalysisResults }
  | { ok: false; resourceLimit: true; message: string; nodeCount: number; detail: string }
  | { ok: false; resourceLimit: false; message: string };

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { nodes, edges, options, ccfGroups } = event.data;
  try {
    const results = analyzeFaultTree(nodes, edges, options, ccfGroups);
    const response: WorkerResponse = { ok: true, results };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: WorkerResponse =
      err instanceof AnalysisResourceLimitError
        ? { ok: false, resourceLimit: true, message: err.message, nodeCount: err.nodeCount, detail: err.detail }
        : { ok: false, resourceLimit: false, message: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};
