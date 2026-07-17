import { useLiveQuote } from "@/lib/market-data/hooks";
import type { Candle } from "@/lib/market-data/types";
import type { MarketKind } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string;
  timeframe: string;
  market?: MarketKind;
  last?: Candle | null;
  onSell?: () => void;
  onBuy?: () => void;
}

/**
 * TradingView-style info bar overlay: symbol · timeframe · OHLC · change,
 * plus SELL/BUY chips anchored top-left of the chart canvas.
 */
export function ChartInfoBar({ symbol, timeframe, market, last, onSell, onBuy }: Props) {
  const q = useLiveQuote(symbol, market);
  const c = last ?? null;
  const chg = c ? c.close - c.open : 0;
  const chgPct = c && c.open ? (chg / c.open) * 100 : 0;
  const px = (n?: number | null) => (n == null ? "—" : n.toFixed(digits(symbol)));

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-background/40 px-2 py-1 text-[11px] backdrop-blur-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          {symbol} · {timeframe} · MDE
        </span>
        <span className="text-muted-foreground">O <span className="tabular-nums text-foreground">{px(c?.open)}</span></span>
        <span className="text-muted-foreground">H <span className="tabular-nums text-foreground">{px(c?.high)}</span></span>
        <span className="text-muted-foreground">L <span className="tabular-nums text-foreground">{px(c?.low)}</span></span>
        <span className="text-muted-foreground">C <span className="tabular-nums text-foreground">{px(c?.close)}</span></span>
        <span className={cn("tabular-nums font-medium", chg >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {chg >= 0 ? "+" : ""}{chg.toFixed(digits(symbol))} ({chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)
        </span>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button onClick={onSell}
          className="flex flex-col items-start rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-left leading-tight hover:bg-rose-500/20">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-rose-400">Sell</span>
          <span className="tabular-nums text-[11px] font-semibold text-rose-300">{px(q?.bid ?? q?.last)}</span>
        </button>
        <div className="flex flex-col items-center text-[9px] leading-tight text-muted-foreground">
          <span className="tabular-nums">{q ? ((q.ask ?? 0) - (q.bid ?? 0)).toFixed(digits(symbol)) : "—"}</span>
          <span className="text-[8px] uppercase">spread</span>
        </div>
        <button onClick={onBuy}
          className="flex flex-col items-start rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-left leading-tight hover:bg-sky-500/20">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-sky-400">Buy</span>
          <span className="tabular-nums text-[11px] font-semibold text-sky-300">{px(q?.ask ?? q?.last)}</span>
        </button>
      </div>
    </div>
  );
}

function digits(sym: string): number {
  const s = sym.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (s.startsWith("XAU") || s.startsWith("XAG")) return 2;
  if (s.includes("USDT") || s.includes("USD")) return 2;
  return 4;
}
