import * as React from "react";
import { TabList as FluentTabList, Tab as FluentTab, type TabValue } from "@fluentui/react-components";

interface TabsContextValue {
  value: TabValue;
  setValue: (v: TabValue) => void;
}
const TabsContext = React.createContext<TabsContextValue | null>(null);
function useTabsContext(name: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error(`<${name}> must be used inside <Tabs>`);
  return ctx;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

/** Radix Tabs' compound-component shape (Tabs/TabsList/TabsTrigger/TabsContent
 * with a `value` string tying triggers to their panel), rebuilt over Fluent's
 * `TabList`/`Tab` — Fluent has no `TabsContent` equivalent, so panel
 * switching is handled here via context instead. */
function Tabs({ defaultValue, value, onValueChange, className, children, ...props }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState<TabValue>(defaultValue ?? "");
  const activeValue = value ?? internalValue;
  const setValue = React.useCallback(
    (v: TabValue) => {
      if (value === undefined) setInternalValue(v);
      onValueChange?.(String(v));
    },
    [value, onValueChange]
  );
  const ctx = React.useMemo(() => ({ value: activeValue, setValue }), [activeValue, setValue]);

  return (
    <TabsContext.Provider value={ctx}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = useTabsContext("TabsList");
  return (
    <FluentTabList
      selectedValue={ctx.value}
      onTabSelect={(_e, data) => ctx.setValue(data.value)}
      size="small"
      className={className}
      {...props}
    >
      {children}
    </FluentTabList>
  );
}

interface TabsTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
  value: string;
}
function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  return (
    <FluentTab value={value} className={className} {...props}>
      {children}
    </FluentTab>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}
function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const ctx = useTabsContext("TabsContent");
  if (ctx.value !== value) return null;
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
