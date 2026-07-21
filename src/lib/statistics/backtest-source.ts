import type { AnalyticsTrade } from "./types";
import { inferSession } from "./session";

interface RawReplayTrade {
  id: string;
  session_id: string;
  symbol: string;
  market: string;
  direction: string;
  entry_price: number | string | null;
  exit_price: number | string | null;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  lot_size: number | string | null;
  risk_pct: number | string | null;
  rr_planned: number | string | null;
  rr_realized: number | string | null;
  pnl: number | string | null;
  commission: number | string | null;
  swap: number | string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
}

const n = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Adapts `replay_trades` rows for a single backtest/replay session into the
 * unified `AnalyticsTrade` shape consumed by the statistics engine.
 */
export function mapReplayTradesToAnalytics(
  trades: RawReplayTrade[],
  sessionMeta?: { id: string; title?: string | null },
): AnalyticsTrade[] {
  return trades
    .filter((t) => t.status === "closed" && t.closed_at)
    .map((t) => {
      const opened = t.opened_at;
      const closed = t.closed_at!;
      const duration =
        opened && closed
          ? Math.max(0, Math.floor((new Date(closed).getTime() - new Date(opened).getTime()) / 1000))
          : null;
      return {
        id: t.id,
        trade_id: t.id,
        account_id: sessionMeta?.id ?? t.session_id,
        symbol: t.symbol,
        market: t.market,
        direction: (t.direction === "short" ? "short" : "long") as "long" | "short",
        entry_price: n(t.entry_price),
        exit_price: n(t.exit_price),
        stop_loss: n(t.stop_loss),
        take_profit: n(t.take_profit),
        lot_size: n(t.lot_size),
        rr: n(t.rr_realized) ?? n(t.rr_planned),
        risk_pct: n(t.risk_pct),
        pnl: Number(t.pnl ?? 0),
        commission: Number(t.commission ?? 0),
        swap: Number(t.swap ?? 0),
        opened_at: opened,
        closed_at: closed,
        duration_seconds: duration,
        session: inferSession(opened),
        setup: null,
        strategy: sessionMeta?.title ?? null,
        emotions: [],
        mistakes: [],
        grade: null,
        status: "closed",
      };
    });
}
