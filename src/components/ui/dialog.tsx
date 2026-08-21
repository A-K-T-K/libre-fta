import * as React from "react";
import {
  Dialog as FluentDialog,
  DialogSurface,
  DialogBody,
  DialogTitle as FluentDialogTitle,
  DialogContent as FluentDialogContent,
  DialogActions,
} from "@fluentui/react-components";
import { cn } from "@/lib/utils";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

/** Radix's `<Dialog><DialogContent><DialogHeader><DialogTitle/>…</DialogHeader>
 * …body…<DialogFooter>…</DialogFooter></DialogContent></Dialog>` shape,
 * rebuilt over Fluent's `Dialog`/`DialogSurface`/`DialogBody`/`DialogTitle`/
 * `DialogContent`/`DialogActions` — Fluent's structure is flatter (title,
 * content, actions are siblings inside one `DialogBody`, not nested the way
 * Radix's are), so `DialogContent` here pulls the header/footer children back
 * apart into that shape rather than nesting them literally. */
function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <FluentDialog open={open} onOpenChange={(_e, data) => onOpenChange?.(data.open)}>
      {children as React.ReactElement}
    </FluentDialog>
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

function isType(node: React.ReactNode, type: React.ComponentType<never>): node is React.ReactElement {
  return React.isValidElement(node) && node.type === type;
}

function DialogContent({ className, children, ...props }: DialogContentProps) {
  const kids = React.Children.toArray(children);
  const header = kids.find((k) => isType(k, DialogHeader)) as React.ReactElement | undefined;
  const footer = kids.find((k) => isType(k, DialogFooter)) as React.ReactElement | undefined;
  const body = kids.filter((k) => k !== header && k !== footer);

  const headerKids = header ? React.Children.toArray((header.props as { children?: React.ReactNode }).children) : [];
  const title = headerKids.find((k) => isType(k, DialogTitle)) as React.ReactElement | undefined;
  const description = headerKids.find((k) => isType(k, DialogDescription)) as React.ReactElement | undefined;

  return (
    <DialogSurface className={className} {...props}>
      <DialogBody>
        {title && <FluentDialogTitle>{(title.props as { children?: React.ReactNode }).children}</FluentDialogTitle>}
        <FluentDialogContent>
          {description}
          {body}
        </FluentDialogContent>
        {footer && <DialogActions>{(footer.props as { children?: React.ReactNode }).children}</DialogActions>}
      </DialogBody>
    </DialogSurface>
  );
}

// Marker components: DialogContent above reads their children back out and
// re-parents them into Fluent's flatter structure, so these never render
// their own DOM directly except DialogDescription (rendered in-place).
function DialogHeader({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
function DialogFooter({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
function DialogTitle({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
function DialogDescription({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
