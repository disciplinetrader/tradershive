/**
 * Replay Studio X — HUD overlay (Phase 1).
 *
 * Transparent, chart-native telemetry. No cards, no glass: hairline text
 * over the candles. Displays balance, open P/L, current R and a discipline
 * meter derived from data the engine already produces (display only).
 */
import { useMemo } from "react";
import { useReplay } from "../context";
import { RxMeter } from "./primitives";
import { cn } from "@/lib/utils";

function money(n: number) {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function ReplayHudOverlay({ className }: { className?: string }) {
  const { session, candles, cursorIdx, trades, openTrades, checklist, score } = useReplay();
  const price = candles[cursorIdx]?.close ?? 0;

  const initialBalance = Number((session?.settings as any)?.initial_balance ?? 10000);

  const realized = useMemo(
    () => trades.reduce((acc, t) => acc + (t.pnl ?? 0), 0),
    [trades],
  );

  const floating = useMemo(
    () =>
      openTrades.reduce(
        (acc, t) => acc + (t.direction === "long" ? price - t.entry_price : t.entry_price - price) * t.lot_size,
        0,
      ),
    [openTrades, price],
  );

  // Current R — floating risk-multiple of the open book, using each
  // position's own stop distance. Falls back to realized R when flat.
  const currentR = useMemo(() => {
    if (openTrades.length) {
      let r = 0;
      for (const t of openTrades) {
        const risk = t.stop_loss ? Math.abs(t.entry_price - t.stop_loss) : 0;
        if (!risk) continue;
        const move = t.direction === "long" ? price - t.entry_price : t.entry_price - price;
        r += move / risk;
      }
      return r;
    }
    return trades.reduce((acc, t) => acc + (t.rr_realized ?? 0), 0);
  }, [openTrades, trades, price]);

  const discipline = useMemo(() => {
    if (score?.discipline != null) return Number(score.discipline);
    if (!checklist.length) return 0;
    return (checklist.filter((c: any) => c.is_checked ?? c.checked).length / checklist.length) * 100;
  }, [score, checklist]);

  const balance = initialBalance + realized;
  const equity = balance + floating;
  const pnlTone = floating > 0 ? "long" : floating < 0 ? "short" : "neutral";

  return (
    <div
      className={cn(
        "pointer-events-none select-none rx-hud grid grid-cols-[72px_auto] items-center gap-x-3 gap-y-1.5 text-[11px] leading-none",
        className,
      )}
      aria-label="Session telemetry"
    >
      <span className="rx-caps">Balance</span>
      <span className="rx-value">{money(equity)}</span>

      <span className="rx-caps">Open P/L</span>
      <span
          className={cn("rx-value", pnlTone === "long" && "rx-long", pnlTone === "short" && "rx-short")}
      >
        {money(floating)}
      </span>

      <span className="rx-caps">Current R</span>
      <span className={cn("rx-value", currentR > 0 && "rx-long", currentR < 0 && "rx-short")}>
        {currentR >= 0 ? "+" : ""}
        {currentR.toFixed(2)}R
      </span>

      <span className="rx-caps">Discipline</span>
      <span className="flex w-[96px] items-center gap-2">
        <RxMeter
          value={discipline}
          label="Discipline meter"
          tone={discipline >= 70 ? "long" : discipline >= 40 ? "warn" : "short"}
        />
        <span className="rx-caps shrink-0">{Math.round(discipline)}</span>
      </span>
    </div>
  );
}
