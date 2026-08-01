/**
 * Floating quick-access bar for pinned drawing tools.
 *
 * Rendered over the chart itself (including focus/fullscreen mode, where the
 * left rail is hidden) so the trader never loses access to the tools they
 * actually use.
 */

import { Star } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolId } from "@/lib/chart/drawings/types";
import { toolById } from "@/components/chart/DrawingToolRail";

interface Props {
  favourites: ToolId[];
  activeTool: ToolId;
  onToolChange: (t: ToolId) => void;
  onUnpin: (t: ToolId) => void;
  className?: string;
}

export function FavoriteToolsBar({ favourites, activeTool, onToolChange, onUnpin, className }: Props) {
  const tools = favourites.map(toolById).filter(Boolean) as NonNullable<ReturnType<typeof toolById>>[];
  if (!tools.length) return null;

  return (
    <div
      role="toolbar"
      aria-label="Favourite drawing tools"
      aria-orientation="vertical"
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-background/85 p-1 shadow-lg backdrop-blur",
        className,
      )}
    >
      <Star className="h-3 w-3 shrink-0 text-primary/70" aria-hidden />
      {tools.map((t) => {
        const Icon = t.icon;
        const active = activeTool === t.id;
        return (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange(t.id)}
                onContextMenu={(e) => { e.preventDefault(); onUnpin(t.id); }}
                aria-pressed={active}
                aria-label={t.label}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-[14px] w-[14px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {t.label}
              <span className="ml-2 opacity-60">Right-click to unpin</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
