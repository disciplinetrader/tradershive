/**
 * Pattern recognition — pure aggregation over historical replay sessions.
 * No LLM. Returns best/worst market, symbol, timeframe, session, RR range,
 * holding time and mode.
 */
export type SessionRow = {
  id: string;
  market: string;
  symbol: string;
  timeframe: string;
  mode: string;
  created_at: string;
  score?: number | null;
};

export type TradeAgg = {
  session_id: string;
  symbol: string;
  market: string;
  rr_realized: number | null;
  pnl: number | null;
  opened_at: string;
  closed_at: string | null;
};

type Bucket = { key: string; count: number; sum: number; wins: number };

function bucketize<T>(rows: T[], keyFn: (r: T) => string, valueFn: (r: T) => number) {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const k = keyFn(r);
    const b = map.get(k) ?? { key: k, count: 0, sum: 0, wins: 0 };
    const v = valueFn(r);
    b.count += 1;
    b.sum += v;
    if (v > 0) b.wins += 1;
    map.set(k, b);
  }
  return Array.from(map.values());
}

function bestWorst(buckets: Bucket[]) {
  if (buckets.length === 0) return { best: null, worst: null };
  const sorted = buckets.filter((b) => b.count >= 2).sort((a, b) => b.sum - a.sum);
  if (sorted.length === 0) return { best: null, worst: null };
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export function sessionHourBucket(iso: string): "asia" | "london" | "new_york" | "other" {
  const h = new Date(iso).getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 21) return "new_york";
  return "other";
}

export function computePatterns(input: { sessions: SessionRow[]; trades: TradeAgg[] }) {
  const { sessions, trades } = input;
  const closed = trades.filter((t) => t.pnl != null);

  const bySymbol = bucketize(closed, (t) => t.symbol, (t) => t.pnl ?? 0);
  const byMarket = bucketize(closed, (t) => t.market, (t) => t.pnl ?? 0);
  const byTf = bucketize(sessions, (s) => s.timeframe, (s) => s.score ?? 0);
  const bySession = bucketize(closed, (t) => sessionHourBucket(t.opened_at), (t) => t.pnl ?? 0);
  const byMode = bucketize(sessions, (s) => s.mode, (s) => s.score ?? 0);

  // Holding time bucket (winners only)
  const winners = closed.filter((t) => (t.pnl ?? 0) > 0 && t.closed_at);
  const holdMins = winners.map(
    (t) => (new Date(t.closed_at!).getTime() - new Date(t.opened_at).getTime()) / 60_000,
  );
  const avgHold = holdMins.length ? holdMins.reduce((a, b) => a + b, 0) / holdMins.length : 0;

  // RR range
  const rrs = closed.map((t) => t.rr_realized ?? 0).filter((v) => v > 0);
  rrs.sort((a, b) => a - b);
  const rrLow = rrs.length ? rrs[Math.floor(rrs.length * 0.25)] : 0;
  const rrHigh = rrs.length ? rrs[Math.floor(rrs.length * 0.75)] : 0;

  return {
    symbol: bestWorst(bySymbol),
    market: bestWorst(byMarket),
    timeframe: bestWorst(byTf),
    session: bestWorst(bySession),
    mode: bestWorst(byMode),
    avg_holding_minutes: Math.round(avgHold),
    rr_range: { low: Number(rrLow.toFixed(2)), high: Number(rrHigh.toFixed(2)) },
    total_sessions: sessions.length,
    total_trades: closed.length,
  };
}

/** 6-metric trader profile derived from real trades + sessions. */
export function computeProfileScores(input: {
  sessions: SessionRow[];
  trades: TradeAgg[];
  mistakes: { kind: string; severity: string }[];
}) {
  const { sessions, trades, mistakes } = input;
  const closed = trades.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closed.length ? wins / closed.length : 0;
  const avgRr = closed.length
    ? closed.reduce((s, t) => s + (t.rr_realized ?? 0), 0) / closed.length
    : 0;
  const scores = sessions.map((s) => s.score ?? 0).filter((v) => v > 0);
  const meanScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const variance = scores.length
    ? scores.reduce((a, b) => a + (b - meanScore) ** 2, 0) / scores.length
    : 0;
  const stdev = Math.sqrt(variance);

  const risk_mistakes = mistakes.filter((m) => ["no_sl", "poor_rm", "moved_sl"].includes(m.kind))
    .length;
  const disc_mistakes = mistakes.filter((m) => ["overtrading", "revenge", "broke_objective"].includes(m.kind))
    .length;
  const psy_mistakes = mistakes.filter((m) => ["fomo", "revenge", "closed_winner_early"].includes(m.kind))
    .length;
  const exec_mistakes = mistakes.filter((m) => ["entered_early", "entered_late", "poor_rr", "ignored_trend"].includes(m.kind))
    .length;
  const patience_mistakes = mistakes.filter((m) => ["overtrading", "fomo", "closed_winner_early"].includes(m.kind))
    .length;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const norm = (mistakeCount: number, denom: number) =>
    denom > 0 ? clamp(100 - (mistakeCount / denom) * 100) : 100;

  const denom = Math.max(1, closed.length);
  return {
    consistency: clamp(Math.max(0, 100 - stdev * 1.5)),
    risk_discipline: norm(risk_mistakes, denom),
    execution_quality: clamp(winRate * 60 + Math.max(0, avgRr) * 15),
    patience: norm(patience_mistakes, denom),
    decision_quality: norm(exec_mistakes, denom),
    confidence: clamp(meanScore * 0.6 + winRate * 40),
    _disc_hint: norm(disc_mistakes, denom),
    _mean_score: Math.round(meanScore),
    _win_rate: Math.round(winRate * 100),
    _avg_rr: Number(avgRr.toFixed(2)),
  };
}

export function inferStyle(input: {
  sessions: SessionRow[];
  trades: TradeAgg[];
}): string {
  const { sessions, trades } = input;
  const tfCounts = new Map<string, number>();
  for (const s of sessions) tfCounts.set(s.timeframe, (tfCounts.get(s.timeframe) ?? 0) + 1);
  const topTf = Array.from(tfCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const closed = trades.filter((t) => t.pnl != null && t.closed_at);
  const avgHold = closed.length
    ? closed.reduce(
        (s, t) => s + (new Date(t.closed_at!).getTime() - new Date(t.opened_at).getTime()) / 60_000,
        0,
      ) / closed.length
    : 0;

  if (avgHold < 30) return "Scalper";
  if (avgHold < 240) return "Intraday";
  if (avgHold < 60 * 24) return "Day Trader";
  if (topTf === "1D" || avgHold >= 60 * 24) return "Swing Trader";
  return "Developing Style";
}
