/**
 * Trader Home 2.0 — server aggregator.
 *
 * Powers the sections of the redesigned Dashboard:
 *   1. Today's Focus     – replay minutes, journal debt, streak, active goals, tasks
 *   2. Performance       – today/week/month R, win rate, profit factor, avg R, drawdown
 *   3. Action Items      – concrete things needing attention with a deep-link
 *   4. Coach Tips        – rule-based insights (AI-ready shape)
 *
 * All values are computed from real platform data.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeGoalProgress, type GoalJournalEntry, type GoalReplaySession, type GoalTrade } from "./goals/progress";
import type { GoalProgress, GoalRow } from "./goals/types";

export type HomeActionKind =
  | "journal_missing"
  | "screenshot_missing"
  | "notes_missing"
  | "replay_unfinished"
  | "goal_missed"
  | "drawdown_warning";

export type HomeActionItem = {
  id: string;
  kind: HomeActionKind;
  title: string;
  detail: string;
  href: string;
  cta: string;
  severity: "info" | "warning" | "critical";
};

export type HomeCoachTip = {
  id: string;
  title: string;
  body: string;
  tag: "review" | "practice" | "psychology" | "risk" | "consistency";
};

export type HomeSummary = {
  focus: {
    replayMinutesToday: number;
    journalMissingToday: number;
    streakDays: number;
    longestStreak: number;
    activeGoalsCount: number;
    completedTasks: number;
    totalTasks: number;
    allClear: boolean;
    activePracticeTimeToday: number; // in seconds
    historicalMarketTimeToday: number; // in seconds
  };
  performance: {
    todayR: number;
    weekR: number;
    monthR: number;
    winRate: number;         // 30d window
    profitFactor: number;    // 30d window
    avgR: number;            // 30d window
    currentDrawdownR: number;// peak-to-trough R over last 60 closed trades
    tradesToday: number;
    tradesWeek: number;
    weekDeltaR: number;      // vs previous 7d
    netPnl30d: number;       // sum of pnl in last 30d
    trades30d: number;       // count of closed trades in last 30d
    pnlSpark14d: number[];   // per-day pnl over the last 14 days
    totalRealizedPnl: number;
    totalR: number;
    expectancy: number;
  };
  actions: HomeActionItem[];
  tips: HomeCoachTip[];
  goals: GoalProgress[];
  generatedAt: string;
};

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysAgo(n: number, from = new Date()) { const x = new Date(from); x.setDate(x.getDate() - n); return x; }
function startOfWeekMon(d = new Date()) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d = new Date()) {
  const x = startOfDay(d); x.setDate(1); return x;
}

export const getHomeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { contextType?: string | null; contextId?: string | null } | undefined) => ({
    contextType: data?.contextType ?? "paper",
    contextId: data?.contextId ?? null,
  }))
  .handler(async ({ context, data }): Promise<HomeSummary> => {
    const uid = context.userId;
    const { contextType, contextId } = data;
    const now = new Date();

    // Map context to database queries
    let tradesQuery: any;
    
    if (contextType === "replay" && contextId) {
      tradesQuery = context.supabase
        .from("replay_trades")
        .select("id, symbol, market, direction, entry_price, opened_at, closed_at, pnl, rr_realized, rr_planned, status")
        .eq("session_id", contextId);
    } else if (contextType === "arena" && contextId) {
      // Battles use paper_trades table but filtered by battle_id
      tradesQuery = context.supabase
        .from("paper_trades")
        .select("id, symbol, direction, entry_price, opened_at, closed_at, pnl, rr_realized, rr_planned, status")
        .eq("battle_id", contextId)
        .is("deleted_at", null);
    } else {
      // Default: paper (or fallback if id missing)
      tradesQuery = context.supabase
        .from("paper_trades")
        .select("id, symbol, direction, entry_price, opened_at, closed_at, pnl, rr_realized, rr_planned, status")
        .eq("user_id", uid)
        .is("deleted_at", null);
      if (contextId && contextType === "paper") tradesQuery = tradesQuery.eq("account_id", contextId);
    }

    const [tradesRes, journalRes, replayRes, goalsRes, streakRes, activityRes, marketRes] = await Promise.all([
      tradesQuery
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(1000),
      context.supabase
        .from("journal_entries")
        .select("id, trade_id, opened_at, closed_at, pnl, rr, risk_pct, notes_text, screenshots, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1000),
      context.supabase
        .from("replay_sessions")
        .select("id, symbol, duration_seconds, status, created_at, updated_at")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("goal_tracking")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("practice_streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", uid)
        .maybeSingle(),
      context.supabase
        .from("activity_logs")
        .select("duration_seconds")
        .eq("user_id", uid)
        .gte("created_at", startOfDay(now).toISOString()),
      context.supabase
        .from("historical_market_replayed")
        .select("duration_seconds")
        .eq("user_id", uid)
        .gte("created_at", startOfDay(now).toISOString()),
    ]);

    const trades = tradesRes.data ?? [];
    const journal = journalRes.data ?? [];
    const replays = replayRes.data ?? [];
    const goals = (goalsRes.data ?? []) as unknown as GoalRow[];
    const streakData = streakRes.data;

    // -------- Focus
    const today0 = startOfDay(now).getTime();
    const week0 = startOfWeekMon(now).getTime();
    const month0 = startOfMonth(now).getTime();

    const replayMinutesToday = Math.round(
      replays
        .filter((r: any) => new Date(r.updated_at ?? r.created_at).getTime() >= today0)
        .reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0) / 60,
    );

    const activePracticeTimeToday = activityRes.data?.reduce((s: number, a: any) => s + (a.duration_seconds || 0), 0) || 0;
    const historicalMarketTimeToday = marketRes.data?.reduce((s: number, m: any) => s + (m.duration_seconds || 0), 0) || 0;

    const journalByTradeId = new Map<string, any>();
    for (const j of journal) if (j.trade_id) journalByTradeId.set(j.trade_id, j);

    const closedToday = trades.filter(
      (t: any) => t.status === "closed" && t.closed_at && new Date(t.closed_at).getTime() >= today0,
    );
    const journalMissingToday = closedToday.filter((t: any) => !journalByTradeId.has(t.id)).length;

    // -------- Streak
    const streakDays = streakData?.current_streak ?? 0;
    const longestStreak = streakData?.longest_streak ?? 0;

    // -------- Goals progress (reuse engine)
    const goalTrades: GoalTrade[] = trades
      .filter((t: any) => t.status === "closed" && t.closed_at)
      .map((t: any) => {
        const j = journalByTradeId.get(t.id);
        return {
          id: t.id,
          opened_at: t.opened_at,
          closed_at: t.closed_at,
          pnl: Number(t.pnl ?? 0),
          rr: t.rr_realized != null ? Number(t.rr_realized) : t.rr_planned != null ? Number(t.rr_planned) : j?.rr != null ? Number(j.rr) : null,
          risk_pct: j?.risk_pct != null ? Number(j.risk_pct) : null,
          has_journal: Boolean(j),
        };
      });
    const goalJournal: GoalJournalEntry[] = journal.map((j) => ({ id: j.id, created_at: j.created_at }));
    const goalReplays: GoalReplaySession[] = replays.map((r) => ({ id: r.id, duration_seconds: r.duration_seconds, created_at: r.created_at }));
    const progress = goals
      .filter((g) => g.active !== false)
      .map((g) => computeGoalProgress(g, { trades: goalTrades, journalEntries: goalJournal, replaySessions: goalReplays, now }));

    const activeGoalsCount = progress.length;
    const completedTasks = progress.filter((p) => p.status === "completed" || p.status === "on_track").length;
    const totalTasks = activeGoalsCount;

    // -------- Performance
    const rrOf = (t: any): number => {
      const raw = t.rr_realized ?? t.rr_planned;
      return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : 0;
    };
    const closedAll = trades.filter((t: any) => t.status === "closed" && t.closed_at);
    const closedTodayR = closedToday.reduce((s: number, t: any) => s + rrOf(t), 0);
    const closedWeek = closedAll.filter((t: any) => new Date(t.closed_at!).getTime() >= week0);
    const closedMonth = closedAll.filter((t: any) => new Date(t.closed_at!).getTime() >= month0);
    const weekR = closedWeek.reduce((s: number, t: any) => s + rrOf(t), 0);
    const monthR = closedMonth.reduce((s: number, t: any) => s + rrOf(t), 0);

    // Previous week
    const prevWeekStart = daysAgo(14, now).getTime();
    const prevWeekEnd = daysAgo(7, now).getTime();
    const prevWeekR = closedAll
      .filter((t: any) => {
        const ts = new Date(t.closed_at!).getTime();
        return ts >= prevWeekStart && ts < prevWeekEnd;
      })
      .reduce((s: number, t: any) => s + rrOf(t), 0);

    // 30-day window for aggregate KPIs
    const win30 = daysAgo(30, now).getTime();
    const w30 = closedAll.filter((t: any) => new Date(t.closed_at!).getTime() >= win30);
    const wins = w30.filter((t: any) => Number(t.pnl ?? 0) > 0);
    const losses = w30.filter((t: any) => Number(t.pnl ?? 0) < 0);
    const winRate = w30.length ? (wins.length / w30.length) * 100 : 0;
    const gross = wins.reduce((s: number, t: any) => s + Number(t.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s: number, t: any) => s + Number(t.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? gross / grossLoss : gross > 0 ? gross : 0;
    const rrs = w30.map(rrOf).filter((x: number) => Number.isFinite(x));
    const avgR = rrs.length ? rrs.reduce((a: number, b: number) => a + b, 0) / rrs.length : 0;
    const netPnl30d = w30.reduce((s: number, t: any) => s + Number(t.pnl ?? 0), 0);

    // 14-day per-day PnL sparkline (oldest → newest)
    const sparkStart = daysAgo(13, startOfDay(now));
    const spark: number[] = Array.from({ length: 14 }, () => 0);
    for (const t of closedAll) {
      const ts = new Date(t.closed_at!).getTime();
      if (ts < sparkStart.getTime()) continue;
      const dayIdx = Math.floor((ts - sparkStart.getTime()) / 86_400_000);
      if (dayIdx >= 0 && dayIdx < 14) spark[dayIdx] += Number(t.pnl ?? 0);
    }

    // Drawdown in R over last 60 closed (peak-to-trough on cumulative R)
    const last60 = [...closedAll].sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()).slice(-60);
    let peak = 0, cum = 0, dd = 0;
    for (const t of last60) {
      cum += rrOf(t);
      if (cum > peak) peak = cum;
      const drop = peak - cum;
      if (drop > dd) dd = drop;
    }

    const totalRealizedPnl = closedAll.reduce((s: number, t: any) => s + Number(t.pnl ?? 0), 0);
    const totalR = closedAll.reduce((s: number, t: any) => s + rrOf(t), 0);
    const expectancy = w30.length ? (winRate / 100) * avgR - (1 - winRate / 100) * Math.abs(avgR) : 0; // Simplified expectancy

    const performance = {
      todayR: closedTodayR,
      weekR,
      monthR,
      winRate,
      profitFactor,
      avgR,
      currentDrawdownR: dd,
      tradesToday: closedToday.length,
      tradesWeek: closedWeek.length,
      weekDeltaR: weekR - prevWeekR,
      netPnl30d,
      trades30d: w30.length,
      pnlSpark14d: spark,
      totalRealizedPnl,
      totalR,
      expectancy,
    };

    // -------- Action items (real)
    const actions: HomeActionItem[] = [];

    if (journalMissingToday > 0) {
      actions.push({
        id: "journal_missing_today",
        kind: "journal_missing",
        title: `${journalMissingToday} trade${journalMissingToday === 1 ? "" : "s"} without a journal entry`,
        detail: "Capture what you saw while it's fresh — it powers the coach and analytics.",
        href: "/journal",
        cta: "Open Journal",
        severity: "warning",
      });
    }

    const noScreenshots = journal.filter((j) => {
      if (!j.closed_at) return false;
      if (new Date(j.closed_at).getTime() < daysAgo(3, now).getTime()) return false;
      return !(Array.isArray(j.screenshots) && j.screenshots.length > 0);
    });
    if (noScreenshots.length > 0) {
      actions.push({
        id: "screenshots_missing",
        kind: "screenshot_missing",
        title: `${noScreenshots.length} recent trade${noScreenshots.length === 1 ? "" : "s"} missing screenshots`,
        detail: "Screenshots make reviews 3× more effective.",
        href: "/journal",
        cta: "Add screenshots",
        severity: "info",
      });
    }

    const noNotes = journal.filter((j) => {
      if (!j.closed_at) return false;
      if (new Date(j.closed_at).getTime() < daysAgo(3, now).getTime()) return false;
      const n = (j.notes_text ?? "").toString().trim();
      return n.length < 12;
    });
    if (noNotes.length > 0) {
      actions.push({
        id: "notes_missing",
        kind: "notes_missing",
        title: `${noNotes.length} entr${noNotes.length === 1 ? "y" : "ies"} without notes`,
        detail: "A 1-line reason locks in the lesson.",
        href: "/journal",
        cta: "Add notes",
        severity: "info",
      });
    }

    const unfinishedReplay = replays.find((r) => r.status && r.status !== "completed" && r.status !== "archived");
    if (unfinishedReplay) {
      actions.push({
        id: `replay_${unfinishedReplay.id}`,
        kind: "replay_unfinished",
        title: "Replay session unfinished",
        detail: unfinishedReplay.symbol ? `${unfinishedReplay.symbol} — resume where you left off.` : "Resume where you left off.",
        href: "/replay",
        cta: "Resume Replay",
        severity: "info",
      });
    }

    for (const p of progress) {
      if (p.status === "missed") {
        actions.push({
          id: `goal_${p.goal.id}`,
          kind: "goal_missed",
          title: `Goal off track: ${p.goal.name}`,
          detail: p.insight,
          href: "/goals",
          cta: "Review goals",
          severity: "critical",
        });
      }
    }

    if (dd >= 3) {
      actions.push({
        id: "drawdown_warning",
        kind: "drawdown_warning",
        title: `Current drawdown: −${dd.toFixed(2)}R`,
        detail: "Consider reducing size or taking a reset session before the next entry.",
        href: "/analytics",
        cta: "Open Analytics",
        severity: "critical",
      });
    }

    // -------- Coach tips (rule-based — AI ready)
    const tips: HomeCoachTip[] = [];

    const yesterdayStart = daysAgo(1, startOfDay(now)).getTime();
    const yesterdayEnd = startOfDay(now).getTime();
    const yLosers = closedAll.filter((t: any) => {
      const ts = new Date(t.closed_at!).getTime();
      return ts >= yesterdayStart && ts < yesterdayEnd && Number(t.pnl ?? 0) < 0;
    });
    if (yLosers.length >= 2) {
      tips.push({
        id: "review_yesterday_losers",
        title: "Review yesterday's losing trades",
        body: `You closed ${yLosers.length} losing trade${yLosers.length === 1 ? "" : "s"} yesterday. A 10-minute review often reveals a repeating setup mistake.`,
        tag: "review",
      });
    }

    const runners = w30.filter((t: any) => Number(t.pnl ?? 0) > 0 && Math.abs(rrOf(t)) > 0 && Math.abs(rrOf(t)) < 1);
    if (runners.length >= 3 && wins.length > 0 && runners.length / wins.length >= 0.4) {
      tips.push({
        id: "exit_winners_early",
        title: "You've been exiting winners early",
        body: `${runners.length} of your recent wins closed below 1R. Try trailing partials past 1R to let winners run.`,
        tag: "psychology",
      });
    }

    if (replayMinutesToday < 15) {
      tips.push({
        id: "replay_practice",
        title: "Replay a session today",
        body: "Even 20 minutes on a past London session sharpens pattern recognition faster than live screen-time.",
        tag: "practice",
      });
    }

    if (streakDays >= 5) {
      tips.push({
        id: "consistency_win",
        title: `${streakDays}-day trading streak — keep the routine`,
        body: "Your consistency is compounding. Stick to your rules today; skip setups that don't match your playbook.",
        tag: "consistency",
      });
    }

    if (dd >= 2 && dd < 3) {
      tips.push({
        id: "risk_reset",
        title: "Cut size until you print a green day",
        body: `Drawdown is ${dd.toFixed(2)}R. Reduce risk 25–50% on the next 3 trades to protect capital.`,
        tag: "risk",
      });
    }

    return {
      focus: {
        replayMinutesToday,
        journalMissingToday,
        streakDays,
        longestStreak,
        activeGoalsCount,
        completedTasks,
        totalTasks,
        allClear:
          journalMissingToday === 0 &&
          (totalTasks === 0 || completedTasks === totalTasks) &&
          replayMinutesToday > 0,
        activePracticeTimeToday,
        historicalMarketTimeToday,
      },
      performance,
      actions: actions.slice(0, 8),
      tips: tips.slice(0, 4),
      goals: progress,
      generatedAt: now.toISOString(),
    };
  });
