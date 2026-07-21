/**
 * Analytics Center — server functions.
 * Adds capabilities on top of the existing statistics engine without
 * duplicating aggregation logic.
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
      context.supabase
        .from("replay_scores")
        .select("session_id, score, discipline, risk, execution, patience, consistency"),
      context.supabase.from("replay_mistakes").select("session_id, kind, severity"),
      context.supabase.from("replay_homework").select("id, status").limit(500),
    ]);

    const sessions = (sessionsRes.data ?? []) as any[];
    const scores = (scoresRes.data ?? []) as any[];
    const mistakes = (mistakesRes.data ?? []) as any[];
    const homework = (homeworkRes.data ?? []) as any[];

    const totalSessions = sessions.length;
    const completed = sessions.filter((s) => s.status === "completed").length;
    const replayMinutes = Math.round(
      sessions.reduce((a, s) => a + Number(s.duration_seconds ?? 0), 0) / 60,
    );

    const avg = (key: string) => {
      const vals = scores.map((s) => Number(s[key]) || 0).filter((n) => n > 0);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    };

    const mistakeCounts = new Map<string, number>();
    for (const m of mistakes) mistakeCounts.set(m.kind, (mistakeCounts.get(m.kind) ?? 0) + 1);
    const topMistakes = Array.from(mistakeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const homeworkTotal = homework.length;
    const homeworkDone = homework.filter((h) => h.status === "completed").length;
    const homeworkPct = homeworkTotal ? Math.round((homeworkDone / homeworkTotal) * 100) : 0;

    return {
      totalSessions,
      completed,
      replayMinutes,
      avgScore: avg("score"),
      avgDiscipline: avg("discipline"),
      avgRisk: avg("risk"),
      avgExecution: avg("execution"),
      avgPatience: avg("patience"),
      avgConsistency: avg("consistency"),
      totalMistakes: mistakes.length,
      topMistakes,
      homeworkTotal,
      homeworkDone,
      homeworkPct,
    };
  });

export const listAnalyticsChampionships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("championship_results")
      .select("id, championship_id, final_rank, pnl, r_multiple, win_rate, created_at, championships(id, name, slug, status, start_at, end_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });
