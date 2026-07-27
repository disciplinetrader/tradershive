import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOAL_KINDS, GOAL_PERIODS, type GoalRow } from "./goals/types";
import { computeGoalProgress, type GoalJournalEntry, type GoalReplaySession, type GoalTrade } from "./goals/progress";

const kindEnum = z.enum(GOAL_KINDS);
const periodEnum = z.enum(GOAL_PERIODS);

export const listUserGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("goal_tracking")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as GoalRow[];
  });

export const createUserGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      kind: kindEnum,
      target_value: z.number().finite(),
      period: periodEnum.default("month"),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      active: z.boolean().optional().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("goal_tracking")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as GoalRow;
  });

export const updateUserGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(80).optional(),
      target_value: z.number().finite().optional(),
      period: periodEnum.optional(),
      active: z.boolean().optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("goal_tracking")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteUserGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("goal_tracking")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Returns every active goal for the current user together with its live
 * progress (computed server-side to keep client payloads small and to make
 * the same math available to future AI Coach features).
 */
export const getGoalsWithProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const [goalsRes, tradesRes, journalRes, replayRes] = await Promise.all([
      context.supabase.from("goal_tracking").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      context.supabase
        .from("paper_trades")
        .select("id, opened_at, closed_at, pnl, rr_realized, rr_planned")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false })
        .limit(5000),
      context.supabase
        .from("journal_entries")
        .select("id, trade_id, opened_at, closed_at, pnl, rr, risk_pct, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(5000),
      context.supabase
        .from("replay_sessions")
        .select("id, duration_seconds, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (goalsRes.error) throw goalsRes.error;
    if (tradesRes.error) throw tradesRes.error;
    if (journalRes.error) throw journalRes.error;
    if (replayRes.error) throw replayRes.error;

    const journalByTrade = new Map<string, any>();
    const standaloneJournal: any[] = [];
    for (const j of journalRes.data ?? []) {
      if (j.trade_id) journalByTrade.set(j.trade_id, j);
      else standaloneJournal.push(j);
    }

    const trades: GoalTrade[] = [];
    for (const t of tradesRes.data ?? []) {
      const j = journalByTrade.get(t.id);
      trades.push({
        id: t.id,
        opened_at: t.opened_at,
        closed_at: t.closed_at,
        pnl: t.pnl != null ? Number(t.pnl) : 0,
        rr: t.rr_realized != null ? Number(t.rr_realized) : t.rr_planned != null ? Number(t.rr_planned) : (j?.rr != null ? Number(j.rr) : null),
        risk_pct: j?.risk_pct != null ? Number(j.risk_pct) : null,
        has_journal: Boolean(j),
      });
    }
    for (const j of standaloneJournal) {
      if (!j.closed_at) continue;
      trades.push({
        id: j.id,
        opened_at: j.opened_at ?? j.closed_at,
        closed_at: j.closed_at,
        pnl: j.pnl != null ? Number(j.pnl) : 0,
        rr: j.rr != null ? Number(j.rr) : null,
        risk_pct: j.risk_pct != null ? Number(j.risk_pct) : null,
        has_journal: true,
      });
    }

    const journalEntries: GoalJournalEntry[] = (journalRes.data ?? []).map((j) => ({
      id: j.id, created_at: j.created_at,
    }));
    const replaySessions: GoalReplaySession[] = (replayRes.data ?? []).map((s) => ({
      id: s.id, duration_seconds: s.duration_seconds, created_at: s.created_at,
    }));

    const inputs = { trades, journalEntries, replaySessions, now: new Date() };
    const goals = (goalsRes.data ?? []) as unknown as GoalRow[];
    const progress = goals
      .filter((g) => g.active !== false)
      .map((g) => computeGoalProgress(g, inputs));

    return { progress, generatedAt: new Date().toISOString() };
  });
