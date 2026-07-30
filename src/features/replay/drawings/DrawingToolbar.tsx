/**
 * Compact vertical drawing toolbar for the Replay chart.
 * Icon-first, tooltip-labelled, keyboard reachable.
 */
import { Minus, MousePointer2, MoveRight, Redo2, Square, Trash2, TrendingUp, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDrawings } from "./store";
import type { DrawingTool } from "./types";

const TOOLS: { key: DrawingTool; icon: any; label: string; shortcut?: string }[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor / Select" },
  { key: "trend_line", icon: TrendingUp, label: "Trend line" },
  { key: "horizontal_ray", icon: Minus, label: "Horizontal ray" },
  { key: "rectangle", icon: Square, label: "Rectangle" },
  { key: "fibonacci", icon: MoveRight, label: "Fibonacci retracement" },
];

export function DrawingToolbar() {
  const { tool, setTool, undo, redo, canUndo, canRedo, selectedId, removeDrawing } = useDrawings();
  return (
    <aside
      role="toolbar"
      aria-label="Drawing tools"
      className="rx-surface rx-line-r flex h-full w-[38px] shrink-0 flex-col items-center gap-0.5 py-1"
    >
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.key;
        return (
          <Tooltip key={t.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t.label}
                aria-pressed={active}
                onClick={() => setTool(t.key)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t.label}</TooltipContent>
          </Tooltip>
        );
      })}
      <div className="my-1 h-px w-5 bg-border/60" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Undo drawing"
            disabled={!canUndo}
            onClick={undo}
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition hover:bg-background/60 hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Undo (⌘Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Redo drawing"
            disabled={!canRedo}
            onClick={redo}
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition hover:bg-background/60 hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Redo (⌘⇧Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Delete selected drawing"
            disabled={!selectedId}
            onClick={() => selectedId && removeDrawing(selectedId)}
            className="mt-auto grid h-7 w-7 place-items-center rounded text-muted-foreground transition hover:bg-background/60 hover:text-danger disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Delete selected (Del)</TooltipContent>
      </Tooltip>
    </aside>
  );
}
