import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, Crosshair, Expand, LineChart as LineChartIcon, RefreshCw, Ruler, Wrench } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLivePrice, engineSymbol } from "@/lib/paper-trading/live-quotes";
import { SYMBOL_BY_KEY } from "@/lib/paper-trading/symbols";
import { useCandles } from "@/lib/market-data/hooks";
import type { MarketKind, Timeframe } from "@/lib/market-data/types";
import { usePaper } from "./context";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];

const TF_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800,
};

const VISIBLE_CANDLES = 72;

type Candle = { o: number; h: number; l: number; c: number };

/**
 * Real market candles for the Paper Trading chart.
 *
 * Chart, watchlist and quotes all resolve through the same canonical symbol
 * mapping (`engineSymbol` + the symbol's market), so the Market Data Engine
 * picks the same provider for each — Binance for crypto, the configured
 * provider for everything else. Nothing here generates price data: the live
 * quote may only nudge the CURRENT candle, never create earlier ones.
 */
function useMarketCandles(symbol: string, tf: string) {
  const meta = SYMBOL_BY_KEY[symbol];
  const price = useLivePrice(symbol);
  const stepSec = TF_SECONDS[tf] ?? 3600;

  const { to, from } = useMemo(() => {
    const now = Date.now();
    const bucket = Math.floor(now / (stepSec * 1000)) * stepSec * 1000;
    return { to: bucket + stepSec * 1000, from: bucket - VISIBLE_CANDLES * stepSec * 1000 };
  }, [stepSec, symbol, tf]);

  const { candles: raw, loading, error, reload } = useCandles(
    meta ? engineSymbol(meta.symbol) : null,
    tf as Timeframe,
    { from, to, limit: VISIBLE_CANDLES, market: meta?.market as MarketKind | undefined },
  );

  const candles = useMemo<Candle[]>(() => {
    const mapped = raw.map((c) => ({ o: c.open, h: c.high, l: c.low, c: c.close }));
    if (price != null && mapped.length) {
      // Update the in-progress candle only — no synthetic history.
      const last = mapped[mapped.length - 1];
      mapped[mapped.length - 1] = {
        ...last,
        c: price,
        h: Math.max(last.h, price),
        l: Math.min(last.l, price),
      };
    }
    return mapped;
  }, [raw, price]);

  return { candles, loading, error: meta ? error : `Unknown symbol "${symbol}".`, reload };
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (prev == null) {
      let s = 0; for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}
function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = Math.max(0, diff), l = Math.max(0, -diff);
    if (i <= period) {
      gains += g; losses += l;
      if (i === period) {
        const rs = losses === 0 ? 100 : gains / losses;
        out.push(100 - 100 / (1 + rs));
      } else out.push(null);
    } else {
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

type Indicator = "sma20" | "sma50" | "ema20" | "rsi14";
const INDICATOR_META: Record<Indicator, { label: string; color: string }> = {
  sma20: { label: "SMA 20", color: "hsl(45, 95%, 60%)" },
  sma50: { label: "SMA 50", color: "hsl(280, 70%, 65%)" },
  ema20: { label: "EMA 20", color: "hsl(190, 90%, 60%)" },
  rsi14: { label: "RSI 14 (sub-pane)", color: "hsl(330, 80%, 65%)" },
};

export function ChartArea() {
  const { symbol, symbolMeta, timeframe, setTimeframe } = usePaper();
  const containerRef = useRef<HTMLDivElement>(null);
  const price = useLivePrice(symbol);
  const { candles, loading, error, reload } = useMarketCandles(symbol, timeframe);
  const [indicators, setIndicators] = useState<Set<Indicator>>(() => new Set<Indicator>(["sma20"]));

  const toggleIndicator = (k: Indicator) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const overlays = useMemo(() => {
    const map: Partial<Record<Indicator, (number | null)[]>> = {};
    if (indicators.has("sma20")) map.sma20 = sma(closes, 20);
    if (indicators.has("sma50")) map.sma50 = sma(closes, 50);
    if (indicators.has("ema20")) map.ema20 = ema(closes, 20);
    return map;
  }, [closes, indicators]);
  const rsiSeries = useMemo(() => (indicators.has("rsi14") ? rsi(closes, 14) : null), [closes, indicators]);

  const min = candles.length ? Math.min(...candles.map((c) => c.l)) : 0;
  const max = candles.length ? Math.max(...candles.map((c) => c.h)) : 1;
  const range = Math.max(1e-9, max - min);
  const priceFmt = (p: number) => (symbolMeta ? p.toFixed(symbolMeta.decimals) : p.toFixed(2));

  const CHART_H = rsiSeries ? 240 : 320;
  const RSI_H = 80;
  const totalH = rsiSeries ? CHART_H + RSI_H : CHART_H;
  const y = (v: number) => CHART_H - ((v - min) / range) * (CHART_H - 20) - 10;
  const step = 800 / Math.max(1, candles.length);

  const linePath = (series: (number | null)[]) => {
    let d = "";
    series.forEach((v, i) => {
      if (v == null) return;
      const x = i * step + step / 2;
      d += (d ? " L " : "M ") + `${x} ${y(v)}`;
    });
    return d;
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LineChartIcon className="h-4 w-4 text-primary" />
          <span className="truncate">{symbol}</span>
          <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{timeframe}</span>
          {price != null && (
            <span className="ml-2 font-mono text-sm tabular-nums text-foreground">{priceFmt(price)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                tf === timeframe
                  ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={tf === timeframe}
              aria-label={`Timeframe ${tf}`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Indicators" title="Indicators">
                <Wrench className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indicators</p>
              <div className="space-y-2">
                {(Object.keys(INDICATOR_META) as Indicator[]).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={indicators.has(k)}
                      onCheckedChange={() => toggleIndicator(k)}
                      id={`ind-${k}`}
                    />
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: INDICATOR_META[k].color }} />
                    <Label htmlFor={`ind-${k}`} className="flex-1 cursor-pointer">{INDICATOR_META[k].label}</Label>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <ToolButton icon={Ruler} label="Drawing tools" />
          <ToolButton icon={Crosshair} label="Crosshair" />
          <ToolButton icon={Camera} label="Screenshot" onClick={captureScreenshot} />
          <ToolButton icon={Expand} label="Fullscreen" onClick={() => containerRef.current?.requestFullscreen?.()} />
          
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_60%)]">
        <svg viewBox={`0 0 800 ${totalH}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="gridStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(148,163,184,0.08)" />
              <stop offset="100%" stopColor="rgba(148,163,184,0.02)" />
            </linearGradient>
          </defs>
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={i} x1="0" x2="800" y1={(i * CHART_H) / 5} y2={(i * CHART_H) / 5} stroke="url(#gridStroke)" />
          ))}
          {candles.map((c, i) => {
            const x = i * step + step / 2;
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
          {(Object.keys(overlays) as Indicator[]).map((k) => {
            const series = overlays[k];
            if (!series) return null;
            return (
              <path key={k} d={linePath(series)} fill="none" stroke={INDICATOR_META[k].color} strokeWidth="1.5" opacity="0.9" />
            );
          })}
          {price != null && (
            <line x1="0" x2="800"
              y1={y(price)} y2={y(price)}
              stroke="hsl(200, 90%, 65%)" strokeDasharray="4 3" strokeWidth="1" />
          )}

          {rsiSeries && (
            <g transform={`translate(0, ${CHART_H})`}>
              <rect x="0" y="0" width="800" height={RSI_H} fill="rgba(15,23,42,0.35)" />
              <line x1="0" x2="800" y1={RSI_H - (70 / 100) * RSI_H} y2={RSI_H - (70 / 100) * RSI_H} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 3" />
              <line x1="0" x2="800" y1={RSI_H - (30 / 100) * RSI_H} y2={RSI_H - (30 / 100) * RSI_H} stroke="rgba(34,197,94,0.4)" strokeDasharray="3 3" />
              <path
                d={(() => {
                  let d = "";
                  rsiSeries.forEach((v, i) => {
                    if (v == null) return;
                    const x = i * step + step / 2;
                    const yy = RSI_H - (v / 100) * RSI_H;
                    d += (d ? " L " : "M ") + `${x} ${yy}`;
                  });
                  return d;
                })()}
                fill="none"
                stroke={INDICATOR_META.rsi14.color}
                strokeWidth="1.5"
              />
              <text x="6" y="12" fontSize="10" fill="hsl(215, 20%, 65%)">RSI 14</text>
            </g>
          )}
        </svg>

        {error && !candles.length ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
            <div className="max-w-sm space-y-3 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-sm font-semibold">Chart data unavailable</p>
              <p className="text-xs text-muted-foreground">
                No real candles could be loaded for {symbol} · {timeframe}. Nothing is drawn rather than showing
                made-up price action.
              </p>
              <p className="text-[11px] text-muted-foreground/70">{error}</p>
              <Button size="sm" variant="outline" onClick={reload}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </div>
        ) : null}

        {loading && !candles.length ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-muted-foreground">
            Loading market data…
          </div>
        ) : null}

        {indicators.size > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
            {Array.from(indicators).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: INDICATOR_META[k].color }} />
                {INDICATOR_META[k].label}
              </span>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled }: { icon: typeof LineChartIcon; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 cursor-pointer transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
