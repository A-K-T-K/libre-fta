import * as React from "react";
import {
  Button as FluentButton,
  makeStyles,
  mergeClasses,
  tokens,
  type ButtonProps as FluentButtonProps,
} from "@fluentui/react-components";

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** No-op under Fluent (kept so existing call sites don't need touching) —
   * Fluent's Button has no Radix-Slot-style child-merging equivalent, and
   * nothing in the app actually passes a custom child through it. */
  asChild?: boolean;
}

const VARIANT_TO_APPEARANCE: Record<ButtonVariant, FluentButtonProps["appearance"]> = {
  default: "primary",
  destructive: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "subtle",
  link: "transparent",
};

const SIZE_TO_FLUENT: Record<ButtonSize, FluentButtonProps["size"]> = {
  default: "medium",
  sm: "small",
  lg: "large",
  icon: "medium",
  "icon-sm": "small",
};

// Fluent's Button has no built-in "danger" appearance, and no dedicated
// square icon-only size — both are common enough across the app's toolbar
// and confirm dialogs to warrant a couple of scoped style overrides here
// rather than repeating them at every call site.
//
// `colorStatusDanger*` (not `colorPaletteRed*`) specifically because the
// "Palette" tokens are fixed brand-color swatches that stay identical in
// light and dark theme by design, while "Status" tokens are the
// theme-aware semantic layer meant for real UI like this — using the
// palette token here made the destructive button render the exact same
// red in both themes regardless of what fit each theme's contrast.
const useStyles = makeStyles({
  danger: {
    backgroundColor: tokens.colorStatusDangerBackground3,
    ":hover": { backgroundColor: tokens.colorStatusDangerBackground3Hover },
    ":active": { backgroundColor: tokens.colorStatusDangerBackground3Pressed },
  },
  iconOnly: {
    minWidth: "unset",
    paddingLeft: 0,
    paddingRight: 0,
  },
});

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild: _asChild, ...props }, ref) => {
    const styles = useStyles();
    const isIconOnly = size === "icon" || size === "icon-sm";
    return (
      <FluentButton
        ref={ref}
        appearance={VARIANT_TO_APPEARANCE[variant]}
        size={SIZE_TO_FLUENT[size]}
        className={mergeClasses(
          variant === "destructive" && styles.danger,
          isIconOnly && styles.iconOnly,
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
