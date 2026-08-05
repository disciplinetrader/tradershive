import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Errors } from "@/lib/server-errors";
import { getHomeSummary } from "../dashboard-home.functions";

/**
 * Server functions to fetch relevant trader data for the AI Mentor.
 * Every function derives the user ID from the authenticated session
 * and returns only necessary fields for the AI.
 */

/** Fetches a high-level performance overview for the AI coach, including streaks and practice time. */
export const getMentorContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // We use getHomeSummary to reuse the logic for streaks, pnl, and practice time
    const summary = await getHomeSummary({ data: {} });
    
    return {
      metrics: {
        winRate: summary.performance.winRate,
        profitFactor: summary.performance.profitFactor,
        avgR: summary.performance.avgR,
        todayR: summary.performance.todayR,
        streak: summary.focus.streakDays,
        bestStreak: summary.focus.longestStreak,
        practiceTimeTodaySec: summary.focus.activePracticeTimeToday,
        marketTimeTodaySec: summary.focus.historicalMarketTimeToday,
        totalRealizedPnl: summary.performance.totalRealizedPnl,
        totalR: summary.performance.totalR,
        expectancy: summary.performance.expectancy,
        netPnl30d: summary.performance.netPnl30d,
        trades30d: summary.performance.trades30d,
      },
      goals: summary.goals,
    };
  });

/** Fetches a high-level performance overview for the AI coach. */
export const getPerformanceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ 
    days: z.number().min(1).max(365).optional().default(30) 
  }).parse(d))
  .handler(async ({ data: { days }, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data, error } = await supabase
      .from("paper_trades")
      .select("pnl, rr_realized, status, opened_at, closed_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("opened_at", since);

    if (error) throw error;
    return { trades: data || [], windowDays: days };
  });

/** Fetches the most recent trades for context. */
export const getRecentTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(50).optional().default(10) }).parse(d))
  .handler(async ({ data: { limit }, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("paper_trades")
      .select("id, symbol, direction, pnl, rr_realized, opened_at, closed_at, status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("opened_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  });

/** Fetches detailed information for a single trade. */
export const getTradeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tradeId: z.string().uuid() }).parse(d))
  .handler(async ({ data: { tradeId }, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("paper_trades")
      .select("*, journal_entries(*)")
      .eq("id", tradeId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw Errors.notFound("Trade not found.");
    return data;
  });

/** Fetches journal patterns and recurring mistakes. */
export const getJournalPatterns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().optional().default(30) }).parse(d))
  .handler(async ({ data: { days }, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from("journal_entries")
      .select("mistakes, emotions, grade, created_at")
      .eq("user_id", userId)
      .gte("created_at", since);

    if (error) throw error;
    return data || [];
  });

/** Fetches a summary of the user's replay sessions. */
export const getReplaySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("replay_sessions")
      .select("id, symbol, created_at, status, initial_balance")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  });

/** Fetches the user's playbook rules. */
export const getPlaybookRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ai_playbooks")
      .select("title, rules, checklist, description")
      .eq("user_id", userId)
      .eq("archived", false);

    if (error) throw error;
    return data || [];
  });

/** Fetches a summary of the user's psychology scores. */
export const getPsychologySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ai_score_snapshots")
      .select("psychology, discipline, consistency, computed_at")
      .eq("user_id", userId)
      .order("computed_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  });

/** Fetches battle performance statistics. */
export const getBattlePerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("battle_participants")
      .select("status, battles(name, status, win_condition)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  });

/** Fetches championship performance. */
export const getChampionshipPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("championship_participants")
      .select("status, championships(id, status)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  });

/** Fetches platform help context. */
export const getPlatformHelp = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ topic: z.string().optional() }).parse(d))
  .handler(async () => {
    return {
      message: "TradersHIVE is a professional trading workspace with Replay, Journaling, and Analytics.",
      features: ["Replay Studio", "Journal X", "Analytics Reports", "Battle Arena"],
    };
  });
