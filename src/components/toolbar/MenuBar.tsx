import { useState } from "react";
import { CheckmarkRegular as Check } from "@fluentui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppActions } from "@/hooks/useAppActions";
import { SaveDiscardCancelDialog } from "@/components/SaveDiscardCancelDialog";
import { cn } from "@/lib/utils";
import { useFTAStore, type GateLabelStyle, type NodeDisplayOptions } from "@/store/ftaStore";

const GATE_LABEL_STYLE_OPTIONS: { value: GateLabelStyle; label: string }[] = [
  { value: "text", label: "Text (AND / OR / …)" },
  { value: "symbol", label: "Symbol (· for AND, + for OR, …)" },
  { value: "hidden", label: "Hidden" },
];

const NODE_DISPLAY_OPTIONS: { key: keyof NodeDisplayOptions; label: string }[] = [
  { key: "showLabel", label: "Show Labels" },
  { key: "showIdentifier", label: "Show Identifiers" },
  { key: "showProbability", label: "Show Probability" },
];

interface MenuButtonProps {
  id: string;
  label: string;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  children: React.ReactNode;
}

/** Native-app-style menu bar behavior: once any menu is open, moving the
 * mouse over a sibling button switches straight to that menu instead of
 * requiring a second click — driven by one shared `openMenu` id in
 * `MenuBar` rather than each button's own independent open state. */
function MenuButton({ id, label, openMenu, setOpenMenu, children }: MenuButtonProps) {
  const isOpen = openMenu === id;
  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => setOpenMenu(open ? id : null)}>
      <DropdownMenuTrigger asChild>
        <button
          onMouseEnter={() => {
            if (openMenu !== null && openMenu !== id) setOpenMenu(id);
          }}
          className={cn(
            "rounded-sm px-2 py-1 text-xs text-foreground/80 outline-none transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          )}
        >
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Shortcut({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto text-[10px] text-muted-foreground">{children}</span>;
}

export function MenuBar() {
  const a = useAppActions();
  const setRunDialogOpen = useFTAStore((s) => s.setRunDialogOpen);
  const newModelConfirmOpen = useFTAStore((s) => s.newModelConfirmOpen);
  const setNewModelConfirmOpen = useFTAStore((s) => s.setNewModelConfirmOpen);
  const setExportPickerOpen = useFTAStore((s) => s.setExportPickerOpen);
  const [newModelSaving, setNewModelSaving] = useState(false);
  const gateLabelStyle = useFTAStore((s) => s.gateLabelStyle);
  const setGateLabelStyle = useFTAStore((s) => s.setGateLabelStyle);
  const nodeDisplay = useFTAStore((s) => s.nodeDisplay);
  const setNodeDisplay = useFTAStore((s) => s.setNodeDisplay);
  const showLeftPanel = useFTAStore((s) => s.showLeftPanel);
  const setShowLeftPanel = useFTAStore((s) => s.setShowLeftPanel);
  const showRightPanel = useFTAStore((s) => s.showRightPanel);
  const setShowRightPanel = useFTAStore((s) => s.setShowRightPanel);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div className="flex h-7 items-center gap-0.5 border-b border-border bg-card px-2 select-none">
      <img
        src={a.theme === "dark" ? "/logo_dark.svg" : "/logo_light.svg"}
        alt=""
        className="mr-1.5 h-4 w-4 p-px"
      />
      <span className="mr-2 text-xs font-semibold tracking-tight">LibRE FTA</span>

      <MenuButton id="file" label="File" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <DropdownMenuItem onClick={() => setNewModelConfirmOpen(true)}>
          New Model <Shortcut>Ctrl+N</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={a.handleImportJson}>
          Open Full Model (.json)… <Shortcut>Ctrl+O</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={a.handleImport}>
          Open Open-PSA MEF… <Shortcut>Ctrl+Shift+O</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void a.handleExportJson()}>
          Save Full Model as JSON <Shortcut>Ctrl+S</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void a.handleExportXml()}>
          Save Open-PSA MEF <Shortcut>Ctrl+Shift+S</Shortcut>
        </DropdownMenuItem>
        {/* Deliberately no shortcut — these are for making a new copy
            without disturbing whatever file is already open, not
            something reached for reflexively the way plain Save is. */}
        <DropdownMenuItem onClick={() => void a.handleExportJson(true)}>Save As JSON…</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void a.handleExportXml(true)}>Save As Open-PSA MEF…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setExportPickerOpen(true)}>
          Export (PNG / SVG / PDF)… <Shortcut>Ctrl+E</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!a.results} onClick={a.exportReportXml}>
          Export Report as XML…
        </DropdownMenuItem>
      </MenuButton>

      <MenuButton id="edit" label="Edit" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <DropdownMenuItem disabled={!a.canUndo} onClick={a.undo}>
          Undo <Shortcut>Ctrl+Z</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!a.canRedo} onClick={a.redo}>
          Redo <Shortcut>Ctrl+Y</Shortcut>
        </DropdownMenuItem>
      </MenuButton>

      <MenuButton id="view" label="View" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <DropdownMenuItem onClick={a.handleAutoLayout}>Auto-layout Tree</DropdownMenuItem>
        <DropdownMenuItem onClick={() => a.rf.fitView({ duration: 300, padding: 0.15 })}>
          Fit to Screen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={a.toggleTheme}>
          {a.theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Panels</DropdownMenuLabel>
        <DropdownMenuItem persistOnClick onSelect={() => setShowLeftPanel(!showLeftPanel)}>
          <Check className={cn("h-3.5 w-3.5", !showLeftPanel && "opacity-0")} />
          Explorer Panel
        </DropdownMenuItem>
        <DropdownMenuItem persistOnClick onSelect={() => setShowRightPanel(!showRightPanel)}>
          <Check className={cn("h-3.5 w-3.5", !showRightPanel && "opacity-0")} />
          Inspector Panel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Gate Label</DropdownMenuLabel>
        {GATE_LABEL_STYLE_OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => setGateLabelStyle(opt.value)}>
            <Check className={cn("h-3.5 w-3.5", gateLabelStyle !== opt.value && "opacity-0")} />
            {opt.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Node Details</DropdownMenuLabel>
        {NODE_DISPLAY_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.key}
            persistOnClick
            onSelect={() => setNodeDisplay({ [opt.key]: !nodeDisplay[opt.key] })}
          >
            <Check className={cn("h-3.5 w-3.5", !nodeDisplay[opt.key] && "opacity-0")} />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </MenuButton>

      <MenuButton id="analysis" label="Analysis" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <DropdownMenuItem onClick={() => setRunDialogOpen(true)} disabled={a.isRunning || a.hasBlockingErrors}>
          Run Analysis… <Shortcut>Ctrl+R</Shortcut>
        </DropdownMenuItem>
      </MenuButton>

      <SaveDiscardCancelDialog
        open={newModelConfirmOpen}
        onOpenChange={setNewModelConfirmOpen}
        title="Start a new model?"
        description="This clears the current tree, every transfer tab, and any analysis results — including undo history."
        discardLabel="Start New Model"
        saving={newModelSaving}
        onDiscard={a.handleNewModel}
        onSave={async () => {
          setNewModelSaving(true);
          // Same "save in whatever format is already tracked, default to
          // the primary Open-PSA MEF format" choice `CloseGuard` makes —
          // see its own comment for why.
          const saved = a.documentKind === "json" ? await a.handleExportJson() : await a.handleExportXml();
          setNewModelSaving(false);
          if (saved) {
            setNewModelConfirmOpen(false);
            a.handleNewModel();
          }
        }}
      />
    </div>
  );
}
