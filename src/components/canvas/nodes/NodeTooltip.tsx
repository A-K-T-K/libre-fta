import type { ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatScientific } from "@/lib/utils";
import type { FaultTreeNodeData } from "@/types/fta";

/** Wraps a canvas node in a hover tooltip showing its name, description,
 * and probability (when the node owns one) after a deliberate pause. */
export function NodeTooltip({ data, children }: { data: FaultTreeNodeData; children: ReactNode }) {
  const prob = data.probability;
  const hasProb =
    data.category !== "gate" &&
    prob !== undefined &&
    (prob.value !== undefined || prob.lambda !== undefined || prob.booleanState !== undefined);

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] space-y-1">
        <div className="font-semibold leading-tight">{data.label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{data.identifier}</div>
        {data.description && <p className="text-[11px] leading-snug text-popover-foreground/90">{data.description}</p>}
        {hasProb && (
          <div className="text-[11px] tabular-nums text-muted-foreground">
            {prob!.booleanState !== undefined
              ? `State: ${prob!.booleanState ? "TRUE" : "FALSE"}`
              : prob!.lambda !== undefined
              ? `λ = ${formatScientific(prob!.lambda, 3)}`
              : `q = ${formatScientific(prob!.value, 3)}`}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
