import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Camera, Crosshair, Expand, LineChart as LineChartIcon, Play, Ruler, Wrench } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLivePrice } from "@/lib/paper-trading/mock-prices";
import { usePaper } from "./context";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];

// Lightweight candle sparkline. Deterministic per symbol.
function useSyntheticCandles(symbol: string, tf: string, count = 60) {
  const price = useLivePrice(symbol);
  return useMemo(() => {
    if (!symbol) return [] as { o: number; h: number; l: number; c: number }[];
    let seed = 0;
    for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) | 0;
    const base = price ?? 100;
    const vol = base * 0.004;
    const candles: { o: number; h: number; l: number; c: number }[] = [];
    let last = base * 0.985;
    for (let i = 0; i < count; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const drift = ((seed % 1000) / 1000 - 0.5) * vol;
      const o = last;
      const c = Math.max(0.0001, o + drift);
      const range = vol * (0.4 + ((seed >> 8) % 100) / 200);
      const h = Math.max(o, c) + range * 0.6;
      const l = Math.min(o, c) - range * 0.4;
      candles.push({ o, h, l, c });
      last = c;
    }
    // last candle chases live price
    if (price != null && candles.length) {
      const lastC = candles[candles.length - 1];
      candles[candles.length - 1] = { ...lastC, c: price, h: Math.max(lastC.h, price), l: Math.min(lastC.l, price) };
    }
    void tf;
    return candles;
  }, [symbol, tf, price]);
}

export function ChartArea() {
  const { symbol, symbolMeta, timeframe, setTimeframe } = usePaper();
  const containerRef = useRef<HTMLDivElement>(null);
  const price = useLivePrice(symbol);
  const candles = useSyntheticCandles(symbol, timeframe, 72);

  const min = candles.length ? Math.min(...candles.map((c) => c.l)) : 0;
  const max = candles.length ? Math.max(...candles.map((c) => c.h)) : 1;
  const range = Math.max(1e-9, max - min);
  const priceFmt = (p: number) => (symbolMeta ? p.toFixed(symbolMeta.decimals) : p.toFixed(2));

  const captureScreenshot = async () => {
    if (!containerRef.current) return;
    try {
      const svg = containerRef.current.querySelector("svg");
      if (!svg) return;
      const s = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${symbol.replace("/", "-")}-${timeframe}.svg`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <GlassCard className="flex h-full min-h-[420px] flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LineChartIcon className="h-4 w-4 text-primary" />
          <span className="truncate">{symbol}</span>
          <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{timeframe}</span>
          {price != null && (
            <span className="ml-2 font-mono text-sm tabular-nums text-foreground">{priceFmt(price)}</span>
          )}
        </div>
        <div className="hidden items-center gap-1 md:flex">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition",
                tf === timeframe ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <ToolButton icon={Wrench} label="Indicators" />
          <ToolButton icon={Ruler} label="Drawing tools" />
          <ToolButton icon={Crosshair} label="Crosshair" />
          <ToolButton icon={Camera} label="Screenshot" onClick={captureScreenshot} />
          <ToolButton icon={Expand} label="Fullscreen" onClick={() => containerRef.current?.requestFullscreen?.()} />
          <ToolButton icon={Play} label="Replay (coming soon)" disabled />
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_60%)]">
        <svg viewBox="0 0 800 320" preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="gridStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(148,163,184,0.08)" />
              <stop offset="100%" stopColor="rgba(148,163,184,0.02)" />
            </linearGradient>
          </defs>
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={i} x1="0" x2="800" y1={(i * 320) / 5} y2={(i * 320) / 5} stroke="url(#gridStroke)" />
          ))}
          {candles.map((c, i) => {
            const step = 800 / candles.length;
            const x = i * step + step / 2;
            const y = (v: number) => 320 - ((v - min) / range) * 300 - 10;
            const bull = c.c >= c.o;
            const color = bull ? "hsl(155, 60%, 55%)" : "hsl(0, 70%, 60%)";
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" />
                <motion.rect
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  x={x - step * 0.35} width={step * 0.7}
                  y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  fill={color} fillOpacity={bull ? 0.75 : 0.85} rx={1.5}
                />
              </g>
            );
          })}
          {price != null && (
            <g>
              <line x1="0" x2="800" y1={320 - ((price - min) / range) * 300 - 10}
                y2={320 - ((price - min) / range) * 300 - 10} stroke="hsl(200, 90%, 65%)" strokeDasharray="4 3" strokeWidth="1" />
            </g>
          )}
        </svg>

        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
          Chart engine: <span className="text-foreground">TradingView-ready</span> · plug in charting library to enable full toolset
        </div>
      </div>
    </GlassCard>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled }: { icon: typeof LineChartIcon; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
