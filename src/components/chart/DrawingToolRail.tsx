import { useMemo, useState } from "react";
import {
  ArrowUpRight, Baseline, Brush, Circle, Crosshair, Eye, EyeOff, GitCommitHorizontal, Grid2x2,
  Lock, LockOpen, Magnet, Minus, MousePointer2, MoveDiagonal, Redo2, Ruler, Square, Star,
  Trash2, TrendingDown, TrendingUp, Triangle, Type, Undo2, Waves, type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DrawingStore } from "@/lib/chart/drawings/store";
import { KIND_LABELS, type ToolId } from "@/lib/chart/drawings/types";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

interface GroupDef {
  id: string;
  label: string;
  icon: LucideIcon;
  tools: ToolDef[];
}

export const TOOL_GROUPS: GroupDef[] = [
  {
    id: "cursors",
    label: "Cursor",
    icon: MousePointer2,
    tools: [
      { id: "cursor", label: "Cursor", icon: MousePointer2, shortcut: "Esc" },
      { id: "crosshair", label: "Crosshair", icon: Crosshair },
    ],
  },
  {
    id: "lines",
    label: "Lines",
    icon: TrendingUp,
    tools: [
      { id: "trend_line", label: KIND_LABELS.trend_line, icon: TrendingUp, shortcut: "Alt+T" },
      { id: "ray", label: KIND_LABELS.ray, icon: ArrowUpRight },
      { id: "extended_line", label: KIND_LABELS.extended_line, icon: MoveDiagonal },
      { id: "horizontal_line", label: KIND_LABELS.horizontal_line, icon: Minus, shortcut: "Alt+H" },
      { id: "horizontal_ray", label: KIND_LABELS.horizontal_ray, icon: GitCommitHorizontal },
      { id: "vertical_line", label: KIND_LABELS.vertical_line, icon: Baseline, shortcut: "Alt+V" },
      { id: "arrow", label: KIND_LABELS.arrow, icon: ArrowUpRight },
    ],
  },
  {
    id: "fib",
    label: "Fibonacci",
    icon: Waves,
    tools: [
      { id: "fib_retracement", label: KIND_LABELS.fib_retracement, icon: Waves, shortcut: "Alt+F" },
      { id: "fib_extension", label: KIND_LABELS.fib_extension, icon: Waves },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    icon: Square,
    tools: [
      { id: "rectangle", label: KIND_LABELS.rectangle, icon: Square, shortcut: "Alt+R" },
      { id: "ellipse", label: KIND_LABELS.ellipse, icon: Circle },
      { id: "triangle", label: KIND_LABELS.triangle, icon: Triangle },
      { id: "brush", label: KIND_LABELS.brush, icon: Brush },
    ],
  },
  {
    id: "annotations",
    label: "Annotations",
    icon: Type,
    tools: [
      { id: "text", label: KIND_LABELS.text, icon: Type },
      { id: "price_label", label: KIND_LABELS.price_label, icon: Baseline },
    ],
  },
  {
    id: "measure",
    label: "Measurement",
    icon: Ruler,
    tools: [
      { id: "measure", label: KIND_LABELS.measure, icon: Ruler, shortcut: "Alt+M" },
      { id: "price_range", label: KIND_LABELS.price_range, icon: MoveDiagonal },
      { id: "date_range", label: KIND_LABELS.date_range, icon: Grid2x2 },
    ],
  },
  {
    id: "positions",
    label: "Positions",
    icon: TrendingUp,
    tools: [
      { id: "long_position", label: KIND_LABELS.long_position, icon: TrendingUp },
      { id: "short_position", label: KIND_LABELS.short_position, icon: TrendingDown },
    ],
  },
];

const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);
export const toolById = (id: ToolId) => ALL_TOOLS.find((t) => t.id === id);

interface Props {
  store: DrawingStore;
  activeTool: ToolId;
  onToolChange: (t: ToolId) => void;
  magnet: boolean;
  onMagnetChange: (v: boolean) => void;
  hidden: boolean;
  onHiddenChange: (v: boolean) => void;
  locked: boolean;
  onLockedChange: (v: boolean) => void;
  /** Store revision — passed so the rail re-renders on undo/redo changes. */
  revision?: unknown;
  /** Pinned quick-access tools. */
  favourites?: ToolId[];
  onToggleFavourite?: (t: ToolId) => void;
  className?: string;
}

/**
 * TradingView-style icon-only drawing rail. Each group remembers its last
 * used tool, so a single click re-arms the trader's preferred object while
 * the caret opens the full group.
 */
export function DrawingToolRail({
  store, activeTool, onToolChange, magnet, onMagnetChange,
  hidden, onHiddenChange, locked, onLockedChange, revision,
  favourites = [], onToggleFavourite, className,
}: Props) {
  const [lastUsed, setLastUsed] = useState<Record<string, ToolId>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const activeGroupId = useMemo(
    () => TOOL_GROUPS.find((g) => g.tools.some((t) => t.id === activeTool))?.id ?? null,
    [activeTool],
  );

  const pick = (groupId: string, tool: ToolId) => {
    setLastUsed((m) => ({ ...m, [groupId]: tool }));
    onToolChange(tool);
    setOpenGroup(null);
  };

  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)} role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
      {TOOL_GROUPS.map((group) => {
        const current = toolById(lastUsed[group.id] ?? group.tools[0].id) ?? group.tools[0];
        const Icon = current.icon;
        const isActive = activeGroupId === group.id;
        return (
          <Popover key={group.id} open={openGroup === group.id} onOpenChange={(o) => setOpenGroup(o ? group.id : null)}>
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => pick(group.id, current.id)}
                    onContextMenu={(e) => { e.preventDefault(); setOpenGroup(group.id); }}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-md transition",
                      isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={isActive}
                    aria-label={group.label}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {current.label}
                  {current.shortcut && <span className="ml-2 opacity-60">{current.shortcut}</span>}
                </TooltipContent>
              </Tooltip>
              <PopoverTrigger asChild>
                <button
                  className="absolute bottom-0 right-0 h-2 w-2 rounded-sm text-muted-foreground/70 hover:text-foreground"
                  aria-label={`${group.label} options`}
                >
                  <span className="block h-0 w-0 border-b-[4px] border-l-[4px] border-b-current border-l-transparent" />
                </button>
              </PopoverTrigger>
            </div>
            <PopoverContent side="right" align="start" className="w-56 p-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
              {group.tools.map((t) => {
                const TIcon = t.icon;
                const pinned = favourites.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex w-full items-center gap-1 rounded-md pr-1 transition",
                      activeTool === t.id ? "bg-primary/15 text-primary" : "hover:bg-muted",
                    )}
                  >
                    <button
                      onClick={() => pick(group.id, t.id)}
                      className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                    >
                      <TIcon className="h-3.5 w-3.5" />
                      <span className="flex-1">{t.label}</span>
                      {t.shortcut && <kbd className="rounded border border-border/60 bg-muted px-1 font-mono text-[9px]">{t.shortcut}</kbd>}
                    </button>
                    {onToggleFavourite && t.id !== "cursor" && t.id !== "crosshair" ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleFavourite(t.id); }}
                        aria-pressed={pinned}
                        aria-label={pinned ? `Unpin ${t.label}` : `Pin ${t.label} to quick access`}
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded",
                          pinned ? "text-primary" : "text-muted-foreground/50 hover:text-foreground",
                        )}
                      >
                        <Star className={cn("h-3 w-3", pinned && "fill-current")} />
                      </button>
                    ) : null}
                  </div>
                );
              })}

            </PopoverContent>
          </Popover>
        );
      })}

      <div className="my-1 h-px w-6 bg-border/60" />

      <RailToggle
        label={magnet ? "Magnet on — snapping to OHLC" : "Magnet off"}
        icon={Magnet} active={magnet} onClick={() => onMagnetChange(!magnet)}
      />
      <RailToggle
        label={locked ? "Unlock all drawings" : "Lock all drawings"}
        icon={locked ? Lock : LockOpen} active={locked}
        onClick={() => { onLockedChange(!locked); store.setAllLocked(!locked); }}
      />
      <RailToggle
        label={hidden ? "Show drawings (H)" : "Hide drawings (H)"}
        icon={hidden ? EyeOff : Eye} active={hidden}
        onClick={() => { onHiddenChange(!hidden); store.setAllHidden(!hidden); }}
      />

      <div className="my-1 h-px w-6 bg-border/60" />

      <RailToggle label="Undo (⌘Z)" icon={Undo2} disabled={!store.canUndo()} onClick={() => store.undo()} />
      <RailToggle label="Redo (⇧⌘Z)" icon={Redo2} disabled={!store.canRedo()} onClick={() => store.redo()} />
      <RailToggle
        label="Remove all drawings" icon={Trash2}
        disabled={!store.list().length}
        onClick={() => store.removeAll()}
        danger
      />
      <span className="sr-only">{String(revision ?? "")}</span>
    </div>
  );
}

function RailToggle({
  label, icon: Icon, active, disabled, danger, onClick,
}: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-foreground",
            active && "bg-primary/15 text-primary",
            danger && "hover:text-danger",
          )}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="h-[15px] w-[15px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
