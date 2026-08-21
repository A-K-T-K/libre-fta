import type { ReactElement } from "react";
import {
  ArrowRedoRegular as Redo2,
  ArrowUndoRegular as Undo2,
  PlayRegular as Play,
  GridRegular as LayoutGrid,
  ArrowUploadRegular as Upload,
  ArrowDownloadRegular as Download,
  ImageRegular as ImageIcon,
  DocumentTextRegular as FileText,
  BracesRegular as JsonIcon,
  ChevronDownRegular as ChevronDown,
  FlashRegular as Zap,
  FlashOffRegular as ZapOff,
  ArrowMinimizeRegular as Shrink,
  MoreHorizontalRegular,
  PanelLeftRegular as PanelLeft,
  PanelRightRegular as PanelRight,
  StopRegular as Stop,
} from "@fluentui/react-icons";
import {
  Spinner,
  Overflow,
  OverflowItem,
  useIsOverflowItemVisible,
  useOverflowMenu,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from "@fluentui/react-components";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RunOptionsDialog } from "./RunOptionsDialog";
import { ScramLocationDialog } from "./ScramLocationDialog";
import { useAppActions } from "@/hooks/useAppActions";
import { useFTAStore } from "@/store/ftaStore";

interface OverflowAction {
  id: string;
  label: string;
  icon: ReactElement;
  onClick: () => void;
  disabled?: boolean;
}

/** A left-side toolbar action that's collapsed into the "more actions" menu
 * (below) once the window is too narrow to show it inline — driven by
 * Fluent's `Overflow`/`OverflowItem`, a `ResizeObserver`-based system with
 * no media-query breakpoints to keep in sync by hand. */
function ToolbarOverflowMenuItem({ action }: { action: OverflowAction }) {
  const isVisible = useIsOverflowItemVisible(action.id);
  if (isVisible) return null;
  return (
    <MenuItem icon={action.icon} onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </MenuItem>
  );
}

function ToolbarOverflowMenu({ actions }: { actions: OverflowAction[] }) {
  const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
  if (!isOverflowing) return null;
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title={`${overflowCount} more action${overflowCount === 1 ? "" : "s"}`}
        >
          <MoreHorizontalRegular className="h-4 w-4" />
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {actions.map((action) => (
            <ToolbarOverflowMenuItem key={action.id} action={action} />
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function Toolbar() {
  const a = useAppActions();
  const runDialogOpen = useFTAStore((s) => s.runDialogOpen);
  const setRunDialogOpen = useFTAStore((s) => s.setRunDialogOpen);
  const showLeftPanel = useFTAStore((s) => s.showLeftPanel);
  const setShowLeftPanel = useFTAStore((s) => s.setShowLeftPanel);
  const showRightPanel = useFTAStore((s) => s.showRightPanel);
  const setShowRightPanel = useFTAStore((s) => s.setShowRightPanel);

  const overflowActions: OverflowAction[] = [
    { id: "undo", label: "Undo", icon: <Undo2 className="h-4 w-4" />, onClick: a.undo, disabled: !a.canUndo },
    { id: "redo", label: "Redo", icon: <Redo2 className="h-4 w-4" />, onClick: a.redo, disabled: !a.canRedo },
    {
      id: "autolayout",
      label: "Auto-layout",
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
      onClick: a.handleAutoLayout,
      disabled: a.layingOut,
    },
    {
      id: "compact",
      label: "Compact View",
      icon: <Shrink className="h-3.5 w-3.5" />,
      onClick: a.handleToggleCompactView,
    },
  ];

  return (
    <div className="flex h-9 items-center gap-1.5 border-b border-border bg-card px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showLeftPanel ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setShowLeftPanel(!showLeftPanel)}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{showLeftPanel ? "Hide Explorer Panel" : "Show Explorer Panel"}</TooltipContent>
      </Tooltip>

      {/* The file this session is currently associated with — sits here,
          next to the panel toggle it was originally requested near, rather
          than in the flexible button row (which already runs tight on
          space) or as its own separate row under the menu bar (a whole
          extra row of chrome for one line of text). Shrinks and truncates
          before anything else in the bar has to. */}
      <span
        className="flex min-w-0 shrink items-center gap-1 text-xs text-muted-foreground"
        title={a.documentName ?? undefined}
      >
        {a.documentName ? (
          <>
            {a.documentKind === "json" ? (
              <JsonIcon className="h-3 w-3 shrink-0" />
            ) : (
              <FileText className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{a.documentName}</span>
          </>
        ) : (
          <span className="italic">Untitled Model</span>
        )}
      </span>

      <Separator orientation="vertical" className="h-5 shrink-0" />

      <Overflow minimumVisible={1} padding={40}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <OverflowItem id="undo" priority={3}>
            <IconButton icon={<Undo2 className="h-4 w-4" />} label="Undo" disabled={!a.canUndo} onClick={a.undo} />
          </OverflowItem>
          <OverflowItem id="redo" priority={3}>
            <IconButton icon={<Redo2 className="h-4 w-4" />} label="Redo" disabled={!a.canRedo} onClick={a.redo} />
          </OverflowItem>

          <Separator orientation="vertical" className="h-5 shrink-0" />

          <OverflowItem id="autolayout" priority={2}>
            <Button variant="ghost" size="sm" onClick={a.handleAutoLayout} disabled={a.layingOut} className="h-7 shrink-0">
              {a.layingOut ? <Spinner size="tiny" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              Auto-layout
            </Button>
          </OverflowItem>

          <OverflowItem id="compact" priority={1}>
            <Button
              variant={a.compactView ? "secondary" : "ghost"}
              size="sm"
              onClick={a.handleToggleCompactView}
              className="h-7 shrink-0"
              title="Shrink node sizes and spacing to fit more of the tree on screen"
            >
              <Shrink className="h-3.5 w-3.5" />
              Compact View
            </Button>
          </OverflowItem>

          <ToolbarOverflowMenu actions={overflowActions} />
        </div>
      </Overflow>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {a.scramAvailable !== null && (
          <button
            type="button"
            onClick={() => a.setScramLocationDialogOpen(true)}
            title="Click to set the SCRAM CLI location"
            className="hidden cursor-pointer sm:inline-flex"
          >
            <Badge variant={a.scramAvailable ? "success" : "outline"}>
              {a.scramAvailable ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
              {a.scramAvailable ? "SCRAM CLI detected" : "Built-in engine"}
            </Badge>
          </button>
        )}
        <ScramLocationDialog />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7">
              <Upload className="h-3.5 w-3.5" />
              Import / Export
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Open-PSA MEF</DropdownMenuLabel>
            <DropdownMenuItem onClick={a.handleImport}>
              <Upload className="h-3.5 w-3.5" /> Import model (.xml)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void a.handleExportXml()}>
              <Download className="h-3.5 w-3.5" /> Export model (.xml)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Full Model</DropdownMenuLabel>
            <DropdownMenuItem onClick={a.handleImportJson}>
              <Upload className="h-3.5 w-3.5" /> Import everything (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void a.handleExportJson()}>
              <Download className="h-3.5 w-3.5" /> Export everything (.json)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Diagram</DropdownMenuLabel>
            <DropdownMenuItem onClick={a.exportDiagramPng}>
              <ImageIcon className="h-3.5 w-3.5" /> Export diagram (.png)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={a.exportDiagramSvg}>
              <ImageIcon className="h-3.5 w-3.5" /> Export diagram (.svg)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Report</DropdownMenuLabel>
            <DropdownMenuItem disabled={!a.results} onClick={a.exportReportXml}>
              <FileText className="h-3.5 w-3.5" /> Export report (.xml)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!a.results} onClick={a.exportReportPdf}>
              <FileText className="h-3.5 w-3.5" /> Export report (.pdf)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          className="h-7"
          onClick={() => setRunDialogOpen(true)}
          disabled={a.isRunning || a.hasBlockingErrors}
          title={a.hasBlockingErrors ? "Fix validation errors first (see the Validation panel)" : undefined}
        >
          {a.isRunning ? <Spinner size="tiny" /> : <Play className="h-3.5 w-3.5" />}
          Run Analysis
        </Button>

        {a.isRunning && (
          <Button size="sm" variant="destructive" className="h-7" onClick={a.cancelRun}>
            <Stop className="h-3.5 w-3.5" /> Stop
          </Button>
        )}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showRightPanel ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setShowRightPanel(!showRightPanel)}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showRightPanel ? "Hide Inspector Panel" : "Show Inspector Panel"}</TooltipContent>
        </Tooltip>
      </div>

      <RunOptionsDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} onRun={a.executeRun} />
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClick} disabled={disabled}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
