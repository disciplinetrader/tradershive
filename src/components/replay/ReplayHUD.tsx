import { Activity, Clock, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { useReplay } from "./context";

/**
 * Compact HUD strip shown above the Replay chart. Surfaces live session
 * telemetry — clock, remaining candles, open positions and floating P&L —
 * without duplicating the trade panel.
 */
export function ReplayHUD() {
  const { candles, cursorIdx, openTrades, session, speed } = useReplay();
  const price = candles[cursorIdx]?.close ?? 0;
  const time = candles[cursorIdx]?.time ? new Date(candles[cursorIdx].time) : null;
  const remaining = Math.max(0, candles.length - 1 - cursorIdx);

  const floating = openTrades.reduce((acc, t) => {
    const pnl = (t.direction === "long" ? price - t.entry_price : t.entry_price - price) * t.lot_size;
    return acc + pnl;
  }, 0);
  const tone = floating > 0 ? "text-success" : floating < 0 ? "text-danger" : "text-muted-foreground";
  const Icon = floating >= 0 ? TrendingUp : TrendingDown;

  const hh = time ? String(time.getUTCHours()).padStart(2, "0") : "--";
  const mm = time ? String(time.getUTCMinutes()).padStart(2, "0") : "--";
  const sessionName =
    time == null
      ? "—"
      : time.getUTCHours() >= 22 || time.getUTCHours() < 6
      ? "Asia"
      : time.getUTCHours() < 12
      ? "London"
      : time.getUTCHours() < 17
      ? "London/NY"
      : "New York";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[3px] border border-border/60 bg-card/60 px-3 py-1.5 text-[11px]">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock className="h-3 w-3" /> {hh}:{mm} UTC
      </span>
      <span className="rounded-[3px] border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {sessionName}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Layers className="h-3 w-3" /> {remaining} left
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Activity className="h-3 w-3" /> {speed}x · {session?.timeframe}
      </span>
      <span className="ml-auto flex items-center gap-3">
        <span className="tabular-nums text-foreground">{price ? price.toFixed(5) : "—"}</span>
        <span className={`flex items-center gap-1 tabular-nums font-semibold ${tone}`}>
          <Icon className="h-3 w-3" /> {floating >= 0 ? "+" : ""}${floating.toFixed(2)}
        </span>
        <span className="text-muted-foreground">{openTrades.length} open</span>
      </span>
    </div>
  );
}
