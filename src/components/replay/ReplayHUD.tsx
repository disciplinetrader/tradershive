import { Activity, CalendarClock, Circle, Layers, Pause, Play, TrendingDown, TrendingUp } from "lucide-react";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";
import { PlaybookQuickAttach } from "@/components/playbook/PlaybookQuickAttach";

/**
 * Compact HUD strip shown above the Replay chart. Surfaces live session
 * telemetry — playback status, clock, remaining candles, open positions and
 * floating P&L — so the trader always sees what matters without hunting.
 */
export function ReplayHUD() {
  const { candles, cursorIdx, openTrades, session, speed, playing, toggle } = useReplay();
  const price = candles[cursorIdx]?.close ?? 0;
  const time = candles[cursorIdx]?.time ? new Date(candles[cursorIdx].time) : null;
  const remaining = Math.max(0, candles.length - 1 - cursorIdx);
  const progressPct = candles.length > 1 ? Math.round(((cursorIdx + 1) / candles.length) * 100) : 0;

  const floating = openTrades.reduce((acc, t) => {
    const pnl = (t.direction === "long" ? price - t.entry_price : t.entry_price - price) * t.lot_size;
    return acc + pnl;
  }, 0);
  const tone = floating > 0 ? "text-success" : floating < 0 ? "text-danger" : "text-muted-foreground";
  const PnlIcon = floating >= 0 ? TrendingUp : TrendingDown;

  const hh = time ? String(time.getUTCHours()).padStart(2, "0") : "--";
  const mm = time ? String(time.getUTCMinutes()).padStart(2, "0") : "--";
  const dateLbl = time
    ? time.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit", timeZone: "UTC" })
    : "—";
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
    <div className="flex flex-wrap items-center gap-2 rounded-[3px] border border-border/60 bg-card/60 px-3 py-1.5 text-[11px] backdrop-blur">
      {/* Playback status pill (click to toggle) */}
      <button
        onClick={toggle}
        aria-label={playing ? "Pause replay" : "Play replay"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          playing
            ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
            : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
        )}
      >
        {playing ? (
          <>
            <Circle className="h-2 w-2 fill-current animate-pulse" />
            Live · {speed}x
          </>
        ) : (
          <>
            <Pause className="h-2.5 w-2.5" />
            Paused
          </>
        )}
      </button>

      {/* Date + time */}
      <span className="flex items-center gap-1 text-muted-foreground">
        <CalendarClock className="h-3 w-3" />
        <span className="tabular-nums text-foreground">{dateLbl}</span>
        <span className="tabular-nums text-foreground">
          {hh}:{mm}
        </span>
        <span className="text-[9px] uppercase">UTC</span>
      </span>

      <span className="rounded-[3px] border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {sessionName}
      </span>

      <span className="hidden sm:flex items-center gap-1 text-muted-foreground">
        <Layers className="h-3 w-3" /> {remaining} left · {progressPct}%
      </span>
      <span className="hidden md:flex items-center gap-1 text-muted-foreground">
        <Activity className="h-3 w-3" /> {session?.timeframe}
      </span>

      <span className="ml-auto flex items-center gap-3">
        <span className="tabular-nums text-foreground font-medium">{price ? price.toFixed(5) : "—"}</span>
        <span
          className={cn(
            "flex items-center gap-1 tabular-nums font-semibold transition-colors duration-200",
            tone,
          )}
        >
          <PnlIcon className="h-3 w-3" /> {floating >= 0 ? "+" : ""}${floating.toFixed(2)}
        </span>
        <span className="text-muted-foreground">
          {openTrades.length} open
        </span>
        <PlaybookQuickAttach context="replay" contextRefId={session?.id ?? null} />
        {!playing && (
          <button
            onClick={toggle}
            className="hidden sm:inline-flex items-center gap-1 rounded-[3px] border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary hover:bg-primary/15 cursor-pointer"
          >
            <Play className="h-2.5 w-2.5 fill-current" /> Resume
          </button>
        )}
      </span>
    </div>
  );
}
