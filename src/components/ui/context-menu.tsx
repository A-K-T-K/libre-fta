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
  contentsWrapper: {
    display: "contents",
  },
});

// `ContextMenuTrigger`/`ContextMenuContent` aren't always direct children of
// `ContextMenu` in this app — e.g. the trigger is wrapped in `NodeTooltip`,
// and the content list is built inside a separate `EventContextMenuContent`
// component — while Fluent's `Menu` strictly requires its children to be
// exactly `[MenuTrigger, MenuPopover]`. So instead of reading Trigger/Content
// back out of `ContextMenu`'s direct children (which only works when they
// truly are direct children), `ContextMenuContent` registers its item list
// into context from wherever it actually renders, and the right-click
// listener is attached around the *entire* subtree rather than a
// specifically-identified trigger element — matching the original Radix
// behavior where any point inside the node opened its context menu.
const RegisterContentContext = React.createContext<((items: React.ReactNode) => void) | null>(null);

interface ContextMenuProps {
  children?: React.ReactNode;
  /** `ContextMenu` sits directly under `NodeTooltip` in GateNode/EventNode
   * (`<NodeTooltip><ContextMenu>…</ContextMenu></NodeTooltip>`), so Fluent's
   * Tooltip clones *this* component to attach its hover handlers (`onMouse-
   * Enter`/`onPointerEnter`/`ref`/…) — component elements don't forward
   * unknown props to their own output automatically the way a DOM element
   * would, so without explicitly re-attaching them to the real trigger div
   * below, the tooltip's hover detection silently never fires. */
  [extraProp: string]: unknown;
}
function ContextMenu({ children, ...triggerHoverProps }: ContextMenuProps) {
  const styles = useStyles();
  const [items, setItems] = React.useState<React.ReactNode>(null);

  const kids = React.Children.toArray(children);
  const triggerEl = kids.find((k) => isType(k, ContextMenuTrigger)) as React.ReactElement | undefined;
  const rest = kids.filter((k) => k !== triggerEl);
  const triggerChild = triggerEl ? (triggerEl.props as { children?: React.ReactNode }).children : null;
  const hasHoverProps = Object.keys(triggerHoverProps).length > 0;
  const clonedTrigger =
    hasHoverProps && React.isValidElement(triggerChild)
      ? React.cloneElement(triggerChild, triggerHoverProps as Record<string, unknown>)
      : triggerChild;

  return (
    <RegisterContentContext.Provider value={setItems}>
      <FluentMenu openOnContext>
        <FluentMenuTrigger>
          <div className={styles.contentsWrapper}>
            {clonedTrigger as React.ReactNode}
            {rest}
          </div>
        </FluentMenuTrigger>
        <MenuPopover>
          <MenuList>{items}</MenuList>
        </MenuPopover>
      </FluentMenu>
    </RegisterContentContext.Provider>
  );
}

function ContextMenuTrigger({ children }: { asChild?: boolean; children?: React.ReactNode }) {
  return <>{children}</>;
}

function ContextMenuContent({ children }: { className?: string; children?: React.ReactNode }) {
  const register = React.useContext(RegisterContentContext);
  React.useEffect(() => {
    register?.(children);
  }, [register, children]);
  return null;
}

interface ContextMenuItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  disabled?: boolean;
  inset?: boolean;
  /** See the matching comment in dropdown-menu.tsx — Radix's `onSelect`
   * needs translating to Fluent's `onClick`, or every context-menu action
   * in GateNode/EventNode silently never fires. Every call site in this app
   * uses `onSelect` purely as "the Radix action-fired callback" (matching
   * the API it grew up with) without ever calling `preventDefault()` to
   * request Radix's "keep the menu open" behavior, so translating it
   * shouldn't imply persistence — that previously kept every context menu
   * open after any click. Pass `persistOnClick` explicitly (Fluent's own
   * prop, forwarded as-is) on the rare item that actually wants to stay
   * open, e.g. a checkbox-style toggle. */
  persistOnClick?: boolean;
  onSelect?: (event: React.MouseEvent<HTMLDivElement>) => void;
}
function ContextMenuItem({ className, disabled, onSelect, onClick, persistOnClick, ...props }: ContextMenuItemProps) {
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

function ContextMenuLabel({ className, children }: { className?: string; children?: React.ReactNode }) {
  const styles = useStyles();
  return <div className={className ? `${styles.label} ${className}` : styles.label}>{children}</div>;
}

function ContextMenuSeparator() {
  return <MenuDivider />;
}

/** Submenus are always authored as flat direct children in this app (no
 * tooltip/wrapper in between), so the simpler read-props-back-out approach
 * still works fine here — only the root trigger/content had the nesting
 * problem above. A nested Fluent `Menu` used as a `MenuList` child renders
 * as an inline submenu row with its own flyout, the standard Fluent v9
 * submenu pattern. */
function ContextMenuSub({ children }: { children?: React.ReactNode }) {
  const kids = React.Children.toArray(children);
  const trigger = kids.find((k) => isType(k, ContextMenuSubTrigger)) as React.ReactElement | undefined;
  const content = kids.find((k) => isType(k, ContextMenuSubContent)) as React.ReactElement | undefined;
  const triggerProps = (trigger?.props ?? {}) as { disabled?: boolean; children?: React.ReactNode };
  const contentChildren = content ? (content.props as { children?: React.ReactNode }).children : null;

  return (
    // Fluent's default submenu hover delay is noticeably laggy for a
    // frequently-used context menu (Add Event/Change Gate Type); a short
    // delay still avoids opening on a fast mouse pass-through but feels
    // near-instant for a deliberate hover.
    <FluentMenu hoverDelay={60}>
      <FluentMenuTrigger>
        <FluentMenuItem disabled={triggerProps.disabled}>{triggerProps.children}</FluentMenuItem>
      </FluentMenuTrigger>
      <MenuPopover>
        <MenuList>{contentChildren}</MenuList>
      </MenuPopover>
    </FluentMenu>
  );
}

function ContextMenuSubTrigger({ children }: { disabled?: boolean; children?: React.ReactNode }) {
  return <>{children}</>;
}
function ContextMenuSubContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
};
