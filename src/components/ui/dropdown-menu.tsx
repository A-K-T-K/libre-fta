import * as React from "react";
import {
  Menu as FluentMenu,
  MenuTrigger as FluentMenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem as FluentMenuItem,
  MenuDivider,
  makeStyles,
  tokens,
  type PositioningShorthand,
} from "@fluentui/react-components";

function isType(node: React.ReactNode, type: React.ComponentType<never>): node is React.ReactElement {
  return React.isValidElement(node) && node.type === type;
}

const useStyles = makeStyles({
  label: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    color: tokens.colorNeutralForeground3,
  },
});

interface DropdownMenuProps {
  children?: React.ReactNode;
  /** Lets a menu bar (see MenuBar.tsx) drive open state itself, so hovering
   * a sibling menu while one is already open can switch straight to it
   * instead of requiring another click. Uncontrolled (Fluent manages its
   * own open state) when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Radix's `<DropdownMenu><DropdownMenuTrigger asChild>{trigger}
 * </DropdownMenuTrigger><DropdownMenuContent>{items}</DropdownMenuContent>
 * </DropdownMenu>` shape, rebuilt over Fluent's `Menu`/`MenuTrigger`/
 * `MenuPopover`/`MenuList` — same pull-apart-and-reassemble approach as the
 * other adapters in this directory since Fluent's trigger/content aren't a
 * flat sibling pair the way Radix's are. */
function DropdownMenu({ children, open, onOpenChange }: DropdownMenuProps) {
  const kids = React.Children.toArray(children);
  const trigger = kids.find((k) => isType(k, DropdownMenuTrigger)) as React.ReactElement | undefined;
  const content = kids.find((k) => isType(k, DropdownMenuContent)) as React.ReactElement | undefined;
  const contentProps = (content?.props ?? {}) as {
    align?: "start" | "end" | "center";
    className?: string;
    children?: React.ReactNode;
  };
  const triggerChild = trigger ? (trigger.props as { children?: React.ReactNode }).children : null;

  const positioning: PositioningShorthand =
    contentProps.align === "start" ? "below-start" : contentProps.align === "end" ? "below-end" : "below";

  return (
    <FluentMenu
      positioning={positioning}
      open={open}
      onOpenChange={onOpenChange ? (_e, data) => onOpenChange(data.open) : undefined}
    >
      <FluentMenuTrigger>{triggerChild as React.ReactElement}</FluentMenuTrigger>
      <MenuPopover className={contentProps.className}>
        <MenuList>{contentProps.children}</MenuList>
      </MenuPopover>
    </FluentMenu>
  );
}

function DropdownMenuTrigger({ children }: { asChild?: boolean; children?: React.ReactNode }) {
  return <>{children}</>;
}

interface DropdownMenuContentProps {
  align?: "start" | "end" | "center";
  className?: string;
  children?: React.ReactNode;
}
function DropdownMenuContent({ children }: DropdownMenuContentProps) {
  return <>{children}</>;
}

interface DropdownMenuItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  disabled?: boolean;
  inset?: boolean;
  /** Radix's `ContextMenuItem`/`DropdownMenuItem` fire `onSelect`, not
   * `onClick` — Fluent's `MenuItem` only recognizes the latter, so every
   * `onSelect` handler across the app would otherwise silently never fire.
   * Most call sites use `onSelect` purely as "the action-fired callback"
   * without ever calling `preventDefault()` to request Radix's "keep menu
   * open" behavior, so translating it must not imply persistence on its
   * own — pass `persistOnClick` (Fluent's own prop, forwarded as-is)
   * explicitly on the rare item that actually wants to stay open. */
  persistOnClick?: boolean;
  onSelect?: (event: React.MouseEvent<HTMLDivElement>) => void;
}
function DropdownMenuItem({ className, disabled, onSelect, onClick, persistOnClick, ...props }: DropdownMenuItemProps) {
  return (
    <FluentMenuItem
      disabled={disabled}
      className={className}
      persistOnClick={persistOnClick}
      onClick={(e) => {
        onClick?.(e);
        onSelect?.(e);
      }}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, children }: { className?: string; children?: React.ReactNode }) {
  const styles = useStyles();
  return <div className={className ? `${styles.label} ${className}` : styles.label}>{children}</div>;
}

function DropdownMenuSeparator() {
  return <MenuDivider />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
