import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Aggregate replay performance across every saved session for the
 * current user. Reads live from `replay_sessions` and `replay_trades`
 * so numbers stay in sync with what the workspace has produced.
 */
export const getReplayPerformanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [sessionsRes, tradesRes, scoresRes] = await Promise.all([
      context.supabase
        .from("replay_sessions")
        .select("id, symbol, market, timeframe, duration_seconds, status, created_at, strategy_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      context.supabase
        .from("replay_trades")
        .select("id, session_id, symbol, market, direction, pnl, rr_realized, status, opened_at, closed_at")
        .order("opened_at", { ascending: false })
        .limit(2000),
      context.supabase
        .from("replay_scores")
        .select("session_id, score, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const sessions = sessionsRes.data ?? [];
    const trades = tradesRes.data ?? [];
    const scores = scoresRes.data ?? [];

    const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null);
    const wins = closedTrades.filter((t) => Number(t.pnl) > 0);
    const losses = closedTrades.filter((t) => Number(t.pnl) < 0);
    const winSum = wins.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
    const lossSum = Math.abs(losses.reduce((a, t) => a + Number(t.pnl ?? 0), 0));

    const symbolCounts = new Map<string, number>();
    for (const s of sessions) {
      symbolCounts.set(s.symbol, (symbolCounts.get(s.symbol) ?? 0) + 1);
    }
    const mostPracticedSymbol =
      Array.from(symbolCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const marketCounts = new Map<string, number>();
    for (const s of sessions) {
      marketCounts.set(s.market, (marketCounts.get(s.market) ?? 0) + 1);
    }
    const mostPracticedMarket =
      Array.from(marketCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const strategyCounts = new Map<string, number>();
    for (const s of sessions) {
      if (s.strategy_id) strategyCounts.set(s.strategy_id, (strategyCounts.get(s.strategy_id) ?? 0) + 1);
    }
    const mostPracticedStrategy =
      Array.from(strategyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const bestScore = scores.reduce((m, r) => Math.max(m, Number(r.score ?? 0)), 0);
    const bestSessionId =
      scores.length > 0
        ? scores.reduce((best, r) => (Number(r.score ?? 0) > Number(best.score ?? 0) ? r : best), scores[0]).session_id
        : null;

    const totalHours = sessions.reduce((a, s) => a + Number(s.duration_seconds ?? 0), 0) / 3600;

    // Weekly improvement series (last 8 weeks) — average score per week.
    const weekly = new Map<string, { total: number; count: number }>();
    for (const r of scores) {
      const d = new Date(r.created_at as string);
      const y = d.getUTCFullYear();
      // ISO week number
      const start = new Date(Date.UTC(y, 0, 1));
      const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
      const key = `${y}-W${String(week).padStart(2, "0")}`;
      const cur = weekly.get(key) ?? { total: 0, count: 0 };
      cur.total += Number(r.score ?? 0);
      cur.count += 1;
      weekly.set(key, cur);
    }
    const weeklyScore = Array.from(weekly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([week, v]) => ({ week, avg: v.count > 0 ? v.total / v.count : 0 }));

    return {
      totals: {
        sessions: sessions.length,
        completed: sessions.filter((s) => s.status === "completed").length,
        active: sessions.filter((s) => s.status === "active" || s.status === "paused").length,
        trades: closedTrades.length,
        hours: Number(totalHours.toFixed(2)),
      },
      performance: {
        winRate: closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0,
        avgRR:
          wins.length > 0
            ? Number((wins.reduce((a, t) => a + Number(t.rr_realized ?? 0), 0) / wins.length).toFixed(2))
            : 0,
        profitFactor: lossSum > 0 ? Number((winSum / lossSum).toFixed(2)) : winSum > 0 ? 999 : 0,
        netPnl: Number(closedTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0).toFixed(2)),
        avgScore:
          scores.length > 0
            ? Math.round(scores.reduce((a, r) => a + Number(r.score ?? 0), 0) / scores.length)
            : 0,
        bestScore,
        bestSessionId,
      },
      preferences: {
        mostPracticedSymbol,
        mostPracticedMarket,
        mostPracticedStrategy,
      },
      weeklyScore,
    };
  });
