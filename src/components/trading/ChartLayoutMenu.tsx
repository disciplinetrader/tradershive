import { Check, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHART_LAYOUTS, useChartLayout, type ChartLayoutKey } from "@/lib/chart/multi-chart";
import { cn } from "@/lib/utils";

/** Tiny wireframe preview of each grid arrangement. */
function LayoutGlyph({ layoutKey }: { layoutKey: ChartLayoutKey }) {
  const cell = "rounded-[1px] bg-current";
  const base = "grid h-3.5 w-3.5 gap-[1.5px] text-muted-foreground";
  if (layoutKey === "1") return <span className={cn(base, "grid-cols-1")}><i className={cell} /></span>;
  if (layoutKey === "2v") return <span className={cn(base, "grid-cols-2")}><i className={cell} /><i className={cell} /></span>;
  if (layoutKey === "2h") return <span className={cn(base, "grid-rows-2")}><i className={cell} /><i className={cell} /></span>;
  if (layoutKey === "3") return <span className={cn(base, "grid-cols-3")}><i className={cell} /><i className={cell} /><i className={cell} /></span>;
  return (
    <span className={cn(base, "grid-cols-2 grid-rows-2")}>
      <i className={cell} /><i className={cell} /><i className={cell} /><i className={cell} />
    </span>
  );
}

/** Chart-grid selector for the workspace toolbar. */
export function ChartLayoutMenu() {
  const { layout, setLayout, activeSlot, setActiveSlot, slotSymbols, enabled } = useChartLayout();
  if (!enabled) return null;
  const multi = slotSymbols.length > 1;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={multi ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              aria-label="Chart layout"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Layout</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Split the chart area into multiple charts</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-[11px]">Chart layout</DropdownMenuLabel>
        {CHART_LAYOUTS.map((l) => (
          <DropdownMenuItem key={l.key} onSelect={() => setLayout(l.key)} className="gap-2 text-xs">
            <LayoutGlyph layoutKey={l.key} />
            <span className="flex-1">{l.label}</span>
            {layout === l.key && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}

        {multi && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px]">Watchlist targets</DropdownMenuLabel>
            {slotSymbols.map((sym, i) => (
              <DropdownMenuItem key={i} onSelect={() => setActiveSlot(i)} className="gap-2 text-xs">
                <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
                  {i === 0 ? "Main" : `#${i + 1}`}
                </span>
                <span className="flex-1 truncate font-mono">{sym}</span>
                {activeSlot === i && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
