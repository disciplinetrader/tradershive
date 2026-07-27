import type { PlaybookEvolution, PlaybookStats, PlaybookTradeExample } from "./types";

type RawTrade = {
  id: string;
  source: "journal" | "paper";
  symbol: string | null;
  side: string | null;
  opened_at: string | null;
  closed_at: string | null;
  pnl: number | null;
  r: number | null;
};

function outcomeOf(r: number | null, pnl: number | null): "win" | "loss" | "breakeven" {
  const val = r ?? pnl ?? 0;
  if (val > 0) return "win";
  if (val < 0) return "loss";
  return "breakeven";
}

export function toExample(t: RawTrade): PlaybookTradeExample {
  return {
    id: t.id,
    source: t.source,
    symbol: t.symbol,
    side: t.side,
    opened_at: t.opened_at,
    closed_at: t.closed_at,
    pnl: t.pnl,
    r_multiple: t.r,
    outcome: outcomeOf(t.r, t.pnl),
  };
}

export function computePlaybookStats(strategyId: string, raws: RawTrade[]): PlaybookStats {
  const trades = raws.map(toExample);
  const closed = trades.filter((t) => t.closed_at || t.pnl != null || t.r_multiple != null);
  const total = closed.length;
  const wins = closed.filter((t) => t.outcome === "win").length;
  const losses = closed.filter((t) => t.outcome === "loss").length;
  const breakevens = closed.filter((t) => t.outcome === "breakeven").length;
  const win_rate = total ? wins / total : 0;

  const rs = closed.map((t) => t.r_multiple).filter((v): v is number => v != null);
  const avg_r = rs.length ? rs.reduce((s, v) => s + v, 0) / rs.length : 0;

  const gp = closed.reduce((s, t) => s + Math.max(0, t.r_multiple ?? t.pnl ?? 0), 0);
  const gl = closed.reduce((s, t) => s + Math.min(0, t.r_multiple ?? t.pnl ?? 0), 0);
  const profit_factor = gl === 0 ? (gp > 0 ? Number.POSITIVE_INFINITY : 0) : gp / Math.abs(gl);

  const holds = closed
    .map((t) => (t.opened_at && t.closed_at ? (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000 : null))
    .filter((v): v is number => v != null && v >= 0);
  const avg_hold_seconds = holds.length ? holds.reduce((s, v) => s + v, 0) / holds.length : 0;

  const sortedByR = [...closed].sort((a, b) => (b.r_multiple ?? b.pnl ?? 0) - (a.r_multiple ?? a.pnl ?? 0));
  const best = sortedByR[0];
  const worst = sortedByR[sortedByR.length - 1];

  return {
    strategy_id: strategyId,
    trades: total,
    wins,
    losses,
    breakevens,
    win_rate,
    avg_r,
    profit_factor,
    avg_hold_seconds,
    best: best && (best.r_multiple ?? best.pnl ?? 0) > 0 ? best : undefined,
    worst: worst && (worst.r_multiple ?? worst.pnl ?? 0) < 0 ? worst : undefined,
    examples: closed
      .slice()
      .sort((a, b) => new Date(b.closed_at ?? b.opened_at ?? 0).getTime() - new Date(a.closed_at ?? a.opened_at ?? 0).getTime()),
  };
}

function bucketize(trades: PlaybookTradeExample[], sinceDays: number) {
  const cutoff = Date.now() - sinceDays * 86400_000;
  return trades.filter((t) => {
    const ts = new Date(t.closed_at ?? t.opened_at ?? 0).getTime();
    return ts >= cutoff;
  });
}

export function computeEvolution(
  raws: RawTrade[],
  versions: Array<{ version: number; created_at: string; change_notes: string | null }>,
  rangeDays = 30,
): PlaybookEvolution {
  const all = raws.map(toExample);
  const curr = bucketize(all, rangeDays);
  const prev = all.filter((t) => {
    const ts = new Date(t.closed_at ?? t.opened_at ?? 0).getTime();
    const now = Date.now();
    return ts < now - rangeDays * 86400_000 && ts >= now - 2 * rangeDays * 86400_000;
  });

  const summarize = (list: PlaybookTradeExample[]) => {
    const closed = list.filter((t) => t.closed_at || t.pnl != null || t.r_multiple != null);
    const wins = closed.filter((t) => t.outcome === "win").length;
    const rs = closed.map((t) => t.r_multiple).filter((v): v is number => v != null);
    return {
      trades: closed.length,
      win_rate: closed.length ? wins / closed.length : 0,
      avg_r: rs.length ? rs.reduce((s, v) => s + v, 0) / rs.length : 0,
    };
  };

  const current = summarize(curr);
  const previous = summarize(prev);

  // Daily buckets over the current range
  const days: Record<string, PlaybookTradeExample[]> = {};
  for (const t of curr) {
    const key = (t.closed_at ?? t.opened_at ?? "").slice(0, 10);
    if (!key) continue;
    (days[key] ??= []).push(t);
  }
  const timeline = Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, ts]) => {
      const s = summarize(ts);
      return { bucket, trades: s.trades, win_rate: s.win_rate, avg_r: s.avg_r };
    });

  return {
    current,
    previous,
    deltas: {
      trades: current.trades - previous.trades,
      win_rate: current.win_rate - previous.win_rate,
      avg_r: current.avg_r - previous.avg_r,
    },
    timeline,
    versions,
  };
}

export function formatHold(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}
