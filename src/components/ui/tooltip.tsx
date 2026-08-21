import * as React from "react";
import { Tooltip as FluentTooltip, type PositioningShorthand } from "@fluentui/react-components";

/** Fluent has no top-level tooltip provider (delay/behavior is per-instance) —
 * kept as a passthrough so `<TooltipProvider>` doesn't need removing from
 * its one call site in App.tsx. */
function TooltipProvider({ children }: { delayDuration?: number; children?: React.ReactNode }) {
  return <>{children}</>;
}

interface TooltipProps {
  /** Accepted for API compatibility with the old Radix wrapper; Fluent's
   * tooltip delay isn't independently configurable per-instance. */
  delayDuration?: number;
  children?: React.ReactNode;
}

function isType(node: React.ReactNode, type: React.ComponentType<never>): node is React.ReactElement {
  return React.isValidElement(node) && node.type === type;
}

const SIDE_TO_POSITIONING: Record<string, PositioningShorthand> = {
  top: "above",
  bottom: "below",
  left: "before",
  right: "after",
};

/** Radix's `<Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger>
 * <TooltipContent side="right">{content}</TooltipContent></Tooltip>` shape,
 * rebuilt over Fluent's single `<Tooltip content={…}>{trigger}</Tooltip>` —
 * Fluent doesn't split trigger/content into separate components, so this
 * pulls both back out of the children and feeds them into one `Tooltip`. */
function Tooltip({ children }: TooltipProps) {
  const kids = React.Children.toArray(children);
  const trigger = kids.find((k) => isType(k, TooltipTrigger)) as React.ReactElement | undefined;
  const content = kids.find((k) => isType(k, TooltipContent)) as React.ReactElement | undefined;
  const contentProps = (content?.props ?? {}) as { side?: string; className?: string; children?: React.ReactNode };
  const triggerChild = trigger ? (trigger.props as { children?: React.ReactNode }).children : null;

  if (!content) return <>{triggerChild}</>;

  return (
    <FluentTooltip
      content={{ children: contentProps.children, className: contentProps.className }}
      relationship="label"
      positioning={contentProps.side ? SIDE_TO_POSITIONING[contentProps.side] : "above"}
      withArrow
    >
      {(triggerChild as React.ReactElement) ?? <span />}
    </FluentTooltip>
  );
}

function TooltipTrigger({ children }: { asChild?: boolean; children?: React.ReactNode }) {
  return <>{children}</>;
}

interface TooltipContentProps {
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children?: React.ReactNode;
}
function TooltipContent({ children }: TooltipContentProps) {
  return <>{children}</>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
