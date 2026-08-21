import * as React from "react";
import { Badge as FluentBadge, type BadgeProps as FluentBadgeProps } from "@fluentui/react-components";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "warning" | "success";

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLElement>, "color"> {
  variant?: BadgeVariant;
}

const VARIANT_MAP: Record<BadgeVariant, { appearance: FluentBadgeProps["appearance"]; color: FluentBadgeProps["color"] }> = {
  default: { appearance: "filled", color: "brand" },
  secondary: { appearance: "tint", color: "informative" },
  outline: { appearance: "outline", color: "informative" },
  destructive: { appearance: "filled", color: "danger" },
  warning: { appearance: "filled", color: "warning" },
  success: { appearance: "filled", color: "success" },
};

function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  const { appearance, color } = VARIANT_MAP[variant];
  return (
    <FluentBadge appearance={appearance} color={color} shape="rounded" className={className} {...props}>
      {children}
    </FluentBadge>
  );
}

export { Badge };
