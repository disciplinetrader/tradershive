/**
 * Phase 9 · practice server functions.
 *
 * Owner-scoped and canonical:
 *   - a practice assignment always points at a Replay session created by the
 *     existing canonical flow (`replay_sessions`);
 *   - completion is idempotent and scores from `chart_closed_trades`;
 *   - blind (surprise) assignments never return dataset/date context while
 *     they are still running — the stripping happens here, on the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findDrill } from "./practice/drills";
import { evaluateDrill, type DrillTrade } from "./practice/evaluate";
import { recommendPractice } from "./practice/recommend";
import { skillResultFromDrill } from "./practice/skills";
import type { Skill } from "./practice/types";

const practiceTypes = [
  "free",
  "guided_drill",
  "playbook",
  "mistake_correction",
  "trade_management",
  "risk",
  "surprise",
] as const;

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  practice_type: z.enum(practiceTypes).default("free"),
  target_skill: z.string().max(64).optional().nullable(),
  target_mistake: z.string().max(64).optional().nullable(),
  playbook_id: z.string().uuid().optional().nullable(),
  drill_id: z.string().max(64).optional().nullable(),
  symbol: z.string().trim().min(1).max(32),
  market: z.string().trim().max(32).default("forex"),
  timeframe: z.string().trim().max(8).default("5m"),
  starting_balance: z.number().positive().max(10_000_000).default(10_000),
  max_risk_pct_per_trade: z.number().min(0.01).max(100).optional(),
  max_trades: z.number().int().min(1).max(50).optional(),
  due_at: z.string().datetime().optional().nullable(),
  created_source: z.enum(["user", "recommendation", "coach", "challenge", "review"]).default("user"),
  replay_date: z.string().optional().nullable(),
});

/** Everything the launcher needs, with blind context withheld server-side. */
function shape(row: any) {
  const blind = row.practice_type === "surprise" && row.status !== "completed" && row.status !== "failed";
  const { hidden_context: _hidden, ...rest } = row;
  return {
    ...rest,
    blind,
    dataset_rules: blind ? {} : row.dataset_rules,
  };
}

export const listPracticeAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("practice_assignments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return (rows ?? []).map(shape);
  });

export const getPracticeAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("practice_assignments")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    return shape(row);
  });

/**
 * Creates a canonical Replay session and the assignment that briefs it. The
 * Replay session is the single source of execution truth; the assignment only
 * carries objectives and rules.
 */
export const createPracticeAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const drill = data.drill_id ? findDrill(data.drill_id) : null;
    if (data.drill_id && !drill) throw new Error("Unknown drill");

    const { data: session, error: sessionError } = await context.supabase
      .from("replay_sessions")
      .insert({
        user_id: context.userId,
        title: data.title,
        mode: "practice",
        market: data.market,
        symbol: data.symbol,
        timeframe: data.timeframe,
        replay_date: data.replay_date ?? null,
        provider: "historical",
        tags: ["practice", data.practice_type],
        cursor_ts: data.replay_date ? new Date(`${data.replay_date}T09:30:00Z`).toISOString() : new Date().toISOString(),
        last_opened_at: new Date().toISOString(),
        initial_balance: data.starting_balance,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    const { data: row, error } = await context.supabase
      .from("practice_assignments")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? drill?.description ?? null,
        practice_type: data.practice_type,
        target_skill: data.target_skill ?? drill?.skill ?? null,
        target_mistake: data.target_mistake ?? null,
        playbook_id: data.playbook_id ?? null,
        drill_id: drill?.id ?? null,
        drill_version: drill?.version ?? null,
        symbol_rules: { symbol: data.symbol },
        timeframe_rules: { timeframe: data.timeframe },
        dataset_rules: { market: data.market, provider: "historical", replay_date: data.replay_date ?? null },
        risk_rules: {
          startingBalance: data.starting_balance,
          maxRiskPctPerTrade: data.max_risk_pct_per_trade ?? drill?.rules.maxRiskPctPerTrade ?? null,
        },
        trade_rules: { maxTrades: data.max_trades ?? drill?.rules.maxTrades ?? null, minTrades: drill?.rules.minTrades ?? null },
        completion: { requiresReview: true, minTrades: drill?.rules.minTrades ?? 1 },
        scoring_profile: drill?.scoreVersion ?? "default_v1",
        created_source: data.created_source,
        due_at: data.due_at ?? null,
        status: "pending",
        replay_session_id: session.id,
        hidden_context:
          data.practice_type === "surprise"
            ? { replay_date: data.replay_date ?? null, market: data.market, provider: "historical" }
            : {},
      })
      .select()
      .single();
    if (error) throw error;
    return shape(row);
  });

export const abandonPracticeAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("practice_assignments")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["pending", "in_progress"]);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Idempotent completion. Repeated calls re-derive the same result and never
 * duplicate skill records (guarded by a unique index on
 * assignment + skill + score version).
 */
export const completePracticeAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), reflections: z.record(z.string(), z.boolean()).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("practice_assignments")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Practice assignment not found");

    const startingBalance = Number((row.risk_rules as any)?.startingBalance ?? 10_000);
    let trades: DrillTrade[] = [];

    if (row.replay_session_id) {
      const { data: raw, error: tradesError } = await context.supabase
        .from("chart_closed_trades")
        .select(
          "id, symbol, direction, entry_time, exit_time, net_pnl, risk_amount, initial_stop, initial_target, final_stop, close_reason",
        )
        .eq("replay_session_id", row.replay_session_id)
        .order("exit_time", { ascending: true });
      if (tradesError) throw tradesError;
      trades = (raw ?? []).map((t: any) => {
        const initialStop = t.initial_stop == null ? null : Number(t.initial_stop);
        const finalStop = t.final_stop == null ? null : Number(t.final_stop);
        const long = t.direction === "long";
        return {
          id: t.id,
          symbol: t.symbol,
          direction: long ? "long" : "short",
          entryTime: Number(t.entry_time),
          exitTime: Number(t.exit_time),
          netPnl: Number(t.net_pnl),
          riskAmount: t.risk_amount == null ? null : Number(t.risk_amount),
          initialStop,
          initialTarget: t.initial_target == null ? null : Number(t.initial_target),
          finalStop,
          closeReason: t.close_reason,
          managedAfterEntry: initialStop != null && finalStop != null && initialStop !== finalStop,
          stopWidened:
            initialStop != null && finalStop != null && (long ? finalStop < initialStop : finalStop > initialStop),
        } satisfies DrillTrade;
      });
    }

    const drill = row.drill_id ? findDrill(row.drill_id) : null;
    const result = drill
      ? evaluateDrill(drill, { startingBalance, trades, reflections: data.reflections })
      : null;

    const status = result ? (result.failed ? "failed" : "completed") : "completed";

    const { data: updated, error: updateError } = await context.supabase
      .from("practice_assignments")
      .update({
        status,
        completed_at: row.completed_at ?? new Date().toISOString(),
        review_session_id: row.replay_session_id,
        result: result
          ? (JSON.parse(JSON.stringify(result)) as Record<string, unknown>)
          : { sampleSize: trades.length, scoreVersion: "default_v1" },
      })
      .eq("id", data.id)
      .select()
      .single();
    if (updateError) throw updateError;

    if (result && row.target_skill) {
      const record = skillResultFromDrill({
        result,
        skill: row.target_skill as Skill,
        sessionId: row.replay_session_id,
        assignmentId: row.id,
      });
      // Unique index makes repeat completions a no-op instead of a duplicate.
      await context.supabase.from("skill_results").upsert(
        {
          user_id: context.userId,
          skill: record.skill,
          score: record.score,
          score_version: record.scoreVersion,
          sample_size: record.sampleSize,
          evidence: record.evidence as any,
          source_session_id: record.sourceSessionId,
          source_assignment_id: record.sourceAssignmentId,
          source_drill_id: record.sourceDrillId,
        },
        { onConflict: "source_assignment_id,skill,score_version", ignoreDuplicates: true },
      );
    }

    return { assignment: shape(updated), result };
  });

export const listSkillProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("skill_results")
      .select("skill, score, score_version, sample_size, evidence, source_session_id, source_assignment_id, source_drill_id, created_at")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

/** Evidence-backed drill recommendations, computed server-side. */
export const getPracticeRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: skills }, { data: breaches }, { data: recent }] = await Promise.all([
      context.supabase.from("skill_results").select("skill, score").limit(500),
      context.supabase.from("challenge_violations").select("rule_id").limit(200),
      context.supabase
        .from("practice_assignments")
        .select("drill_id")
        .not("drill_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const skillScores: Record<string, { average: number | null; attempts: number }> = {};
    for (const row of skills ?? []) {
      const key = row.skill as string;
      const bucket = (skillScores[key] ??= { average: null, attempts: 0 });
      if (row.score != null) {
        const prev = bucket.average ?? 0;
        bucket.average = Math.round(((prev * bucket.attempts + Number(row.score)) / (bucket.attempts + 1)) * 10) / 10;
        bucket.attempts += 1;
      }
    }

    const challengeBreaches: Record<string, number> = {};
    for (const row of breaches ?? []) {
      challengeBreaches[row.rule_id as string] = (challengeBreaches[row.rule_id as string] ?? 0) + 1;
    }

    return recommendPractice({
      mistakeCounts: {},
      skillScores,
      challengeBreaches,
      recentDrillIds: (recent ?? []).map((r: any) => r.drill_id).filter(Boolean),
    });
  });
