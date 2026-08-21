import * as React from "react";
import { Label as FluentLabel } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // `<label>`'s CSS default is `display: inline` (Fluent doesn't override
    // it), so a short label like "Label" shares its line with whatever
    // follows in normal flow instead of starting its own — a longer label
    // like "Open-PSA Identifier" only *looked* correctly stacked because it
    // was too wide to fit next to the input and wrapped, not because the
    // layout was actually stacking them. `block` makes every field's
    // label-then-input pattern (space-y-1.5 stacks) consistent regardless
    // of label text length.
    <FluentLabel size="small" className={cn("block", className)} ref={ref} {...props} />
  )
);
Label.displayName = "Label";

export { Label };
