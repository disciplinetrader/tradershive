import { useState } from "react";
import {
  Plus, TrendingUp, LayoutGrid, Bell, Film, Camera, Save, Maximize2,
  Undo2, Redo2, PanelRightClose, ChevronDown, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHART_TYPES, INDICATORS, TIMEFRAMES, GRID_LAYOUTS } from "@/lib/chart/constants";
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
  onToggleRightPanel?: () => void;
  rightPanelOpen?: boolean;
}

const QUICK_TFS: Timeframe[] = ["1m","3m","5m","15m","30m","1H","2H","4H","1D","1W","1M"];

export function ChartToolbar({
  settings, onChange, indicators, onAddIndicator, onRemoveIndicator,
  grid, onGridChange, onScreenshot, onSaveLayout, onFullscreen,
  onOpenAlerts, onOpenReplay, onToggleRightPanel, rightPanelOpen,
}: Props) {
  const [openInd, setOpenInd] = useState(false);
  const [openType, setOpenType] = useState(false);
  const [openGrid, setOpenGrid] = useState(false);

  return (
    <div className="no-scrollbar flex h-10 items-center gap-1 overflow-x-auto border-b border-border/60 bg-surface-2 px-2 text-xs">
      {/* Symbol chip */}
      <div className="flex items-center gap-1.5 rounded-md bg-background/60 px-2 py-1 text-[13px] font-semibold tracking-wide">
        <span className="uppercase">{settings.symbol.replace("/", "")}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </div>
      <IconBtn title="Compare"><Plus className="h-3.5 w-3.5" /></IconBtn>

      <Divider />

      {/* Timeframe pills */}
      <div className="flex items-center">
        {QUICK_TFS.map((tf) => (
          <button
            key={tf}
            onClick={() => onChange({ timeframe: tf })}
            className={cn(
              "rounded px-1.5 py-1 text-[11px] font-medium tabular-nums transition",
              settings.timeframe === tf
                ? "bg-primary/25 text-primary"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {tf.replace("H","h").replace("M","M")}
          </button>
        ))}
        <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
      </div>

      <Divider />

      {/* Chart type */}
      <Popover open={openType} onOpenChange={setOpenType}>
        <PopoverTrigger asChild>
          <button className="flex h-7 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground" title="Chart type">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor"><rect x="2" y="5" width="2" height="6" rx="0.5"/><rect x="7" y="2" width="2" height="12" rx="0.5"/><rect x="12" y="7" width="2" height="4" rx="0.5"/></svg>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="start">
          {CHART_TYPES.map((t) => (
            <button key={t.key} onClick={() => { onChange({ chartType: t.key as ChartType }); setOpenType(false); }}
              className={cn("block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-primary/10",
                settings.chartType === t.key && "bg-primary/15 text-primary")}>
              {t.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Indicators */}
      <Popover open={openInd} onOpenChange={setOpenInd}>
        <PopoverTrigger asChild>
          <button className="flex h-7 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground" title="Indicators">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="tabular-nums opacity-70">{indicators.length || ""}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add indicator</div>
          <div className="grid max-h-64 grid-cols-1 gap-0.5 overflow-y-auto">
            {INDICATORS.map((i) => (
              <button key={i.key} onClick={() => { onAddIndicator(i.key); setOpenInd(false); }}
                className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-primary/10">
                <span>{i.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{i.pane}</span>
              </button>
            ))}
          </div>
          {indicators.length ? (
            <>
              <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</div>
              <div className="space-y-0.5">
                {indicators.map((cfg) => (
                  <div key={cfg.id} className="flex items-center justify-between rounded px-2 py-1 text-xs">
                    <span>{cfg.key.toUpperCase()}</span>
                    <button onClick={() => onRemoveIndicator(cfg.id)} className="text-[10px] text-danger hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      {/* Layouts */}
      <Popover open={openGrid} onOpenChange={setOpenGrid}>
        <PopoverTrigger asChild>
          <button className="flex h-7 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground" title="Layouts">
            <LayoutGrid className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          {GRID_LAYOUTS.map((g) => (
            <button key={g.key} onClick={() => { onGridChange(g.key); setOpenGrid(false); }}
              className={cn("block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-primary/10",
                grid === g.key && "bg-primary/15 text-primary")}>
              {g.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* P / L / I / B / 3 / 1 mimic chips (kept minimal & functional) */}
      <div className="ml-1 hidden items-center gap-0.5 md:flex">
        <Chip>P</Chip><Chip>L</Chip><Chip>I</Chip><Chip>B</Chip><Chip>3</Chip><Chip>1</Chip>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <IconBtn title="Alerts" onClick={onOpenAlerts}><Bell className="h-3.5 w-3.5" /></IconBtn>
        {onOpenReplay ? <IconBtn title="Replay" onClick={onOpenReplay}><Film className="h-3.5 w-3.5" /></IconBtn> : null}
        <IconBtn title="Undo"><Undo2 className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Redo"><Redo2 className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Screenshot" onClick={onScreenshot}><Camera className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Save layout" onClick={onSaveLayout}><Save className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Fullscreen" onClick={onFullscreen}><Maximize2 className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Chart settings" onClick={() => onChange({ showGrid: !settings.showGrid })}>
          <Settings2 className="h-3.5 w-3.5" />
        </IconBtn>
        {onToggleRightPanel ? (
          <IconBtn title={rightPanelOpen ? "Hide side panel" : "Show side panel"} onClick={onToggleRightPanel}>
            <PanelRightClose className="h-3.5 w-3.5" />
          </IconBtn>
        ) : null}

        <button className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-background/70 px-3 text-[12px] font-semibold text-foreground shadow-sm hover:bg-background">
          Trade
        </button>
        <button className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-sm hover:brightness-110">
          Publish
        </button>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
      {children}
    </button>
  );
}
function Divider() { return <div className="mx-1 h-5 w-px bg-border/50" />; }
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-6 w-6 place-items-center rounded border border-border/50 text-[10px] font-semibold text-muted-foreground">
      {children}
    </div>
  );
}
