import { useState } from "react";
import {
  Camera, LayoutGrid, Maximize2, PencilRuler, Settings2, TrendingUp, Bell, Save, Layers, Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHART_TYPES, INDICATORS, TIMEFRAMES, GRID_LAYOUTS, DRAWING_TOOLS } from "@/lib/chart/constants";
import type { ChartSettings, ChartType, DrawingTool, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/market-data/types";

interface Props {
  settings: ChartSettings;
  onChange: (s: Partial<ChartSettings>) => void;
  indicators: IndicatorConfig[];
  onAddIndicator: (key: IndicatorKey) => void;
  onRemoveIndicator: (id: string) => void;
  grid: string;
  onGridChange: (g: string) => void;
  activeTool: DrawingTool;
  onToolChange: (t: DrawingTool) => void;
  onScreenshot: () => void;
  onSaveLayout: () => void;
  onFullscreen: () => void;
  onOpenAlerts: () => void;
  onOpenReplay?: () => void;
}

export function ChartToolbar({
  settings, onChange, indicators, onAddIndicator, onRemoveIndicator,
  grid, onGridChange, activeTool, onToolChange,
  onScreenshot, onSaveLayout, onFullscreen, onOpenAlerts, onOpenReplay,
}: Props) {
  const [openInd, setOpenInd] = useState(false);
  const [openDraw, setOpenDraw] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-card/40 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1">
        {TIMEFRAMES.map((tf) => (
          <button key={tf} onClick={() => onChange({ timeframe: tf as Timeframe })}
            className={cn("rounded px-2 py-1 text-xs font-medium transition",
              settings.timeframe === tf ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
            {tf}
          </button>
        ))}
      </div>

      <div className="mx-2 h-6 w-px bg-border/60" />

      <Select value={settings.chartType} onValueChange={(v) => onChange({ chartType: v as ChartType })}>
        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{CHART_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
      </Select>

      <Popover open={openInd} onOpenChange={setOpenInd}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Indicators<span className="text-muted-foreground">({indicators.length})</span></Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Add indicator</div>
          <div className="grid max-h-64 grid-cols-1 gap-0.5 overflow-y-auto">
            {INDICATORS.map((i) => (
              <button key={i.key} onClick={() => { onAddIndicator(i.key); setOpenInd(false); }}
                className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-primary/10">
                <span>{i.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{i.pane}</span>
              </button>
            ))}
          </div>
          {indicators.length ? (
            <>
              <div className="mt-3 mb-1 text-xs font-medium text-muted-foreground">Active</div>
              <div className="space-y-0.5">
                {indicators.map((cfg) => (
                  <div key={cfg.id} className="flex items-center justify-between rounded px-2 py-1 text-sm">
                    <span>{cfg.key.toUpperCase()}</span>
                    <button onClick={() => onRemoveIndicator(cfg.id)} className="text-xs text-rose-400 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      <Popover open={openDraw} onOpenChange={setOpenDraw}>
        <PopoverTrigger asChild>
          <Button variant={activeTool !== "cursor" ? "default" : "ghost"} size="sm" className="h-8 gap-1.5">
            <PencilRuler className="h-3.5 w-3.5" />Draw
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="grid max-h-72 grid-cols-1 gap-0.5 overflow-y-auto">
            {DRAWING_TOOLS.map((t) => (
              <button key={t.key} onClick={() => { onToolChange(t.key); setOpenDraw(false); }}
                className={cn("flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-primary/10",
                  activeTool === t.key && "bg-primary/15 text-primary")}>
                <span>{t.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{t.group}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="mx-2 h-6 w-px bg-border/60" />

      <Select value={grid} onValueChange={onGridChange}>
        <SelectTrigger className="h-8 w-[110px] text-xs"><LayoutGrid className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
        <SelectContent>{GRID_LAYOUTS.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}</SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onOpenAlerts}><Bell className="h-3.5 w-3.5" />Alerts</Button>
        {onOpenReplay ? <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onOpenReplay}><Film className="h-3.5 w-3.5" />Replay</Button> : null}
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onScreenshot}><Camera className="h-3.5 w-3.5" />Snap</Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onSaveLayout}><Save className="h-3.5 w-3.5" />Save</Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onFullscreen}><Maximize2 className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onChange({ showGrid: !settings.showGrid })} title="Grid"><Layers className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Settings"><Settings2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
