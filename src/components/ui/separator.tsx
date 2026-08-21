import * as React from "react";
import { Divider } from "@fluentui/react-components";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

function Separator({ orientation = "horizontal", className, ...props }: SeparatorProps) {
  return <Divider vertical={orientation === "vertical"} className={className} {...props} />;
}

export { Separator };
