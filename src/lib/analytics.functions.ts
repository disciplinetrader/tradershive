/**
 * Analytics Center — server functions.
 * Adds capabilities on top of the existing statistics engine without
 * duplicating aggregation logic:
 *  - list saved backtests (completed replay sessions)
 *  - fetch the trades that back a single backtest (for the Backtest Selector)
 *  - compact replay analytics for the Replay section
 *  - lightweight list of recent championships for the Championships section
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listBacktests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("replay_sessions")
      .select("id, title, symbol, market, timeframe, mode, status, created_at, updated_at, completion_pct")
      .is("deleted_at", null)
      .in("status", ["completed", "paused", "archived"])
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const listBacktestTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [sessionRes, tradesRes] = await Promise.all([
      context.supabase
        .from("replay_sessions")
        .select("id, title, symbol, market, timeframe, mode, status")
        .eq("id", data.session_id)
        .maybeSingle(),
      context.supabase
        .from("replay_trades")
        .select("*")
        .eq("session_id", data.session_id)
        .order("opened_at", { ascending: true }),
    ]);
    if (sessionRes.error) throw sessionRes.error;
    if (tradesRes.error) throw tradesRes.error;
    return { session: sessionRes.data, trades: tradesRes.data ?? [] };
  });

export const getReplayAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [sessionsRes, scoresRes, mistakesRes, homeworkRes] = await Promise.all([
      context.supabase
        .from("replay_sessions")
        .select("id, status, duration_seconds, completion_pct, created_at")
        .is("deleted_at", null),
      context.supabase.from("replay_scores").select("session_id, score, execution_score:score"),
      context.supabase.from("replay_mistakes").select("session_id, mistake_type"),
      context.supabase.from("replay_homework").select("id, completed, status").limit(500),
    ]);

    const sessions = sessionsRes.data ?? [];
    const scores = scoresRes.data ?? [];
    const mistakes = mistakesRes.data ?? [];
    const homework = homeworkRes.data ?? [];

    const totalSessions = sessions.length;
    const completed = sessions.filter((s: any) => s.status === "completed").length;
    const replayMinutes = sessions.reduce((a: number, s: any) => a + Number(s.duration_seconds ?? 0), 0) / 60;

    const scoreVals = scores.map((r: any) => Number(r.score) || 0).filter((n: number) => n > 0);
    const avgScore = scoreVals.length ? scoreVals.reduce((a: number, b: number) => a + b, 0) / scoreVals.length : 0;

    const mistakeCounts = new Map<string, number>();
    for (const m of mistakes as any[]) mistakeCounts.set(m.mistake_type, (mistakeCounts.get(m.mistake_type) ?? 0) + 1);
    const topMistakes = Array.from(mistakeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const homeworkTotal = homework.length;
    const homeworkDone = (homework as any[]).filter((h) => h.completed === true || h.status === "completed").length;
    const homeworkPct = homeworkTotal ? (homeworkDone / homeworkTotal) * 100 : 0;

    return {
      totalSessions,
      completed,
      replayMinutes: Math.round(replayMinutes),
      avgScore: Math.round(avgScore * 10) / 10,
      totalMistakes: mistakes.length,
      topMistakes,
      homeworkTotal,
      homeworkDone,
      homeworkPct: Math.round(homeworkPct),
    };
  });

export const listAnalyticsChampionships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("championship_participants")
      .select("id, championship_id, final_rank, final_pnl, final_score, joined_at, championships(id, name, slug, status, start_at, end_at)")
      .eq("user_id", context.userId)
      .order("joined_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });
