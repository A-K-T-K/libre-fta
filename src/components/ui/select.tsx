import * as React from "react";
import { Dropdown as FluentDropdown, Option as FluentOption } from "@fluentui/react-components";

function isType(node: React.ReactNode, type: React.ComponentType<never>): node is React.ReactElement {
  return React.isValidElement(node) && node.type === type;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
}

/** Radix's `<Select><SelectTrigger><SelectValue/></SelectTrigger>
 * <SelectContent><SelectItem value="x">Label</SelectItem>…</SelectContent>
 * </Select>` shape, rebuilt over Fluent's `Dropdown`/`Option` — Fluent's
 * `Dropdown` renders its options as direct children (no separate trigger/
 * content split), so `Select` here reads the trigger's className and the
 * content's `SelectItem` list back out of the tree and feeds them straight
 * into one `Dropdown`. */
function Select({ value, onValueChange, children }: SelectProps) {
  const kids = React.Children.toArray(children);
  const trigger = kids.find((k) => isType(k, SelectTrigger)) as React.ReactElement | undefined;
  const content = kids.find((k) => isType(k, SelectContent)) as React.ReactElement | undefined;
  const triggerProps = (trigger?.props ?? {}) as { className?: string };

  const options = content
    ? (React.Children.toArray((content.props as { children?: React.ReactNode }).children) as React.ReactElement[])
    : [];
  const selected = options.find((o) => (o.props as { value?: string }).value === value);
  const displayText = selected ? (selected.props as { children?: React.ReactNode }).children : "";

  return (
    <FluentDropdown
      value={typeof displayText === "string" ? displayText : String(displayText ?? "")}
      selectedOptions={value !== undefined ? [value] : []}
      onOptionSelect={(_e, data) => {
        if (data.optionValue !== undefined) onValueChange?.(data.optionValue);
      }}
      className={triggerProps.className}
    >
      {options.map((o) => {
        const p = o.props as { value: string; children?: React.ReactNode };
        return (
          <FluentOption key={p.value} value={p.value} text={typeof p.children === "string" ? p.children : String(p.value)}>
            {p.children}
          </FluentOption>
        );
      })}
    </FluentDropdown>
  );
}

// Marker components — Select above reads their props back out and never
// renders them directly; they exist only to keep call sites unchanged.
function SelectTrigger({ children }: { className?: string; children?: React.ReactNode }) {
  return <>{children}</>;
}
function SelectContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
function SelectItem({ children }: { value: string; children?: React.ReactNode }) {
  return <>{children}</>;
}
function SelectValue() {
  return null;
}
function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
