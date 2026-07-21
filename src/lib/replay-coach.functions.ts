/**
 * AI Replay Coach — server surface.
 *
 * Rules:
 * - All calls are authenticated via `requireSupabaseAuth`; every write is
 *   RLS-scoped to `auth.uid()`.
 * - Deterministic analytics (mistakes, patterns, profile) never call the LLM.
 * - LLM calls go through `enforceAiRateLimit` under a `review_per_day` bucket
 *   and use `Output.object` + `NoObjectGeneratedError` fallback.
 * - Everything is derived from real replay session data. No mocks.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { DEFAULT_MODEL } from "@/lib/ai/constants";
import { enforceAiRateLimit } from "@/lib/ai/rate-limit.server";
import {
  REPLAY_COACH_SYSTEM_PROMPT,
  ReplayDebriefSchema,
  HomeworkSchema,
  CoachReportSchema,
  CoachRecommendationsSchema,
} from "@/lib/ai/replay-prompts";
import { detectReplayMistakes } from "@/lib/replay-coach/mistakes";
import {
  computePatterns,
  computeProfileScores,
  inferStyle,
  sessionHourBucket,
} from "@/lib/replay-coach/patterns";

/* ============ helpers ============ */

function gatewayKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("Missing LOVABLE_API_KEY");
  return k;
}

async function safeStructured<T>(
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T | null> {
  const gateway = createLovableAiGatewayProvider(gatewayKey(), undefined, {
    structuredOutputs: true,
  });
  try {
    const { experimental_output } = await generateText({
      model: gateway(DEFAULT_MODEL),
      system: REPLAY_COACH_SYSTEM_PROMPT,
      prompt,
      experimental_output: Output.object({ schema }),
    });
    return experimental_output as T;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      try {
        const parsed = JSON.parse((err as any).text ?? "{}");
        return schema.parse(parsed);
      } catch {
        return null;
      }
    }
    throw err;
  }
}

/* ============ mistake detection ============ */

export const analyzeReplayMistakes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: trades }, { data: session }] = await Promise.all([
      context.supabase
        .from("replay_trades")
        .select("id,status,entry_price,exit_price,stop_loss,take_profit,risk_pct,rr_realized,rr_planned,pnl,direction,opened_at,closed_at")
        .eq("session_id", data.session_id),
      context.supabase
        .from("replay_sessions")
        .select("id,symbol,timeframe,mode,market")
        .eq("id", data.session_id)
        .maybeSingle(),
    ]);
    const detected = detectReplayMistakes({
      trades: (trades ?? []) as any,
      symbol: session?.symbol,
      timeframe: session?.timeframe,
    });
    // Reset then insert atomically to keep this idempotent.
    await context.supabase.from("replay_mistakes").delete().eq("session_id", data.session_id);
    if (detected.length > 0) {
      await context.supabase.from("replay_mistakes").insert(
        detected.map((m) => ({
          user_id: context.userId,
          session_id: data.session_id,
          trade_id: m.trade_id,
          kind: m.kind,
          severity: m.severity,
          evidence: m.evidence,
        })),
      );
    }
    return { count: detected.length, mistakes: detected };
  });

export const listReplayMistakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        session_id: z.string().uuid().optional(),
        limit: z.number().int().max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("replay_mistakes")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(data.limit);
    if (data.session_id) q = q.eq("session_id", data.session_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ============ patterns + profile ============ */

async function loadPatternInputs(
  supabase: any,
  userId: string,
  windowDays = 180,
) {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const [{ data: sessions }, { data: trades }, { data: scores }, { data: mistakes }] =
    await Promise.all([
      supabase
        .from("replay_sessions")
        .select("id,market,symbol,timeframe,mode,created_at")
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("replay_trades")
        .select("session_id,symbol,market,rr_realized,pnl,opened_at,closed_at")
        .eq("user_id", userId)
        .gte("opened_at", since)
        .limit(5000),
      supabase
        .from("replay_scores")
        .select("session_id,score")
        .eq("user_id", userId),
      supabase
        .from("replay_mistakes")
        .select("kind,severity")
        .eq("user_id", userId)
        .gte("detected_at", since)
        .limit(2000),
    ]);
  const scoreMap = new Map<string, number>();
  (scores ?? []).forEach((s: any) => scoreMap.set(s.session_id, Number(s.score) || 0));
  const enrichedSessions = (sessions ?? []).map((s: any) => ({
    ...s,
    score: scoreMap.get(s.id) ?? null,
  }));
  return { sessions: enrichedSessions, trades: trades ?? [], mistakes: mistakes ?? [] };
}

export const computePatternInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sessions, trades } = await loadPatternInputs(context.supabase, context.userId);
    return computePatterns({ sessions: sessions as any, trades: trades as any });
  });

export const computeTraderProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sessions, trades, mistakes } = await loadPatternInputs(context.supabase, context.userId);
    const scores = computeProfileScores({
      sessions: sessions as any,
      trades: trades as any,
      mistakes: mistakes as any,
    });
    const style = inferStyle({ sessions: sessions as any, trades: trades as any });
    const patterns = computePatterns({ sessions: sessions as any, trades: trades as any });

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    if (scores.risk_discipline >= 75) strengths.push("Strong risk discipline");
    else if (scores.risk_discipline < 50) weaknesses.push("Risk discipline needs work");
    if (scores.patience >= 75) strengths.push("Patient entries");
    else if (scores.patience < 50) weaknesses.push("Impatient — overtrading tendency");
    if (scores.execution_quality >= 70) strengths.push("Sharp execution");
    else if (scores.execution_quality < 45) weaknesses.push("Execution quality low");
    if (scores.consistency >= 75) strengths.push("Consistent scores");
    else if (scores.consistency < 50) weaknesses.push("High score variance");

    const row = {
      user_id: context.userId,
      style,
      strengths,
      weaknesses,
      consistency: scores.consistency,
      risk_discipline: scores.risk_discipline,
      execution_quality: scores.execution_quality,
      patience: scores.patience,
      decision_quality: scores.decision_quality,
      confidence: scores.confidence,
      snapshot: { patterns, scores },
      updated_at: new Date().toISOString(),
    };
    await context.supabase.from("replay_trader_profile").upsert(row, { onConflict: "user_id" });
    return row;
  });

export const getTraderProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_trader_profile")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

/* ============ confidence ============ */

export const computeConfidenceScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sessions, trades, mistakes } = await loadPatternInputs(
      context.supabase,
      context.userId,
      30,
    );
    const scores = computeProfileScores({
      sessions: sessions as any,
      trades: trades as any,
      mistakes: mistakes as any,
    });
    const overall = Math.round(
      (scores.execution_quality + scores.risk_discipline + scores.patience + scores._disc_hint) /
        4,
    );
    const { data: prev } = await context.supabase
      .from("replay_confidence_history")
      .select("*")
      .eq("user_id", context.userId)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prior = prev
      ? {
          execution: Number(prev.execution),
          risk: Number(prev.risk),
          psychology: Number(prev.psychology),
          discipline: Number(prev.discipline),
          overall: Number(prev.overall),
        }
      : null;
    const cur = {
      execution: scores.execution_quality,
      risk: scores.risk_discipline,
      psychology: scores.patience,
      discipline: scores._disc_hint,
      overall,
    };
    const deltas = prior
      ? {
          execution: cur.execution - prior.execution,
          risk: cur.risk - prior.risk,
          psychology: cur.psychology - prior.psychology,
          discipline: cur.discipline - prior.discipline,
          overall: cur.overall - prior.overall,
        }
      : { execution: 0, risk: 0, psychology: 0, discipline: 0, overall: 0 };

    const reasons: Record<string, string> = {};
    if (deltas.execution > 3) reasons.execution = `Win rate ${scores._win_rate}% + avg RR ${scores._avg_rr}`;
    if (deltas.risk < -3) reasons.risk = "More risk-management mistakes than last snapshot";
    if (deltas.psychology < -3) reasons.psychology = "Overtrading / FOMO patterns detected";
    if (deltas.discipline < -3) reasons.discipline = "Broke checklist objectives";
    if (deltas.overall > 3) reasons.overall = "Overall trading confidence improving";

    const { data: row, error } = await context.supabase
      .from("replay_confidence_history")
      .insert({ user_id: context.userId, ...cur, deltas, reasons })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const getConfidenceTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(7).max(365).default(90) }).parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows } = await context.supabase
      .from("replay_confidence_history")
      .select("*")
      .eq("user_id", context.userId)
      .gte("taken_at", since)
      .order("taken_at");
    return rows ?? [];
  });

/* ============ debrief (LLM) ============ */

export const generateReplayDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rl = await enforceAiRateLimit(context.supabase, context.userId, ["review_per_day"]);
    if (!rl.ok) throw new Error("AI rate limit exceeded — try again later");

    const [{ data: session }, { data: trades }, { data: checklist }, { data: bookmarks }, { data: notes }, { data: score }, { data: mistakes }] =
      await Promise.all([
        context.supabase.from("replay_sessions").select("*").eq("id", data.session_id).maybeSingle(),
        context.supabase.from("replay_trades").select("*").eq("session_id", data.session_id),
        context.supabase.from("replay_checklists").select("*").eq("session_id", data.session_id),
        context.supabase.from("replay_bookmarks").select("*").eq("session_id", data.session_id),
        context.supabase.from("replay_notes").select("body,note_ts").eq("session_id", data.session_id),
        context.supabase.from("replay_scores").select("*").eq("session_id", data.session_id).maybeSingle(),
        context.supabase.from("replay_mistakes").select("kind,severity,evidence").eq("session_id", data.session_id),
      ]);

    if (!session) throw new Error("Session not found");

    const closed = (trades ?? []).filter((t: any) => t.status === "closed");
    const wins = closed.filter((t: any) => (t.pnl ?? 0) > 0).length;
    const totals = {
      trades: (trades ?? []).length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      win_rate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
      net_pnl: closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0).toFixed(2),
      avg_rr: closed.length
        ? (closed.reduce((s: number, t: any) => s + (t.rr_realized ?? 0), 0) / closed.length).toFixed(2)
        : "0",
    };
    const bestTrade = [...closed].sort((a: any, b: any) => (b.pnl ?? 0) - (a.pnl ?? 0))[0];
    const worstTrade = [...closed].sort((a: any, b: any) => (a.pnl ?? 0) - (b.pnl ?? 0))[0];

    const summary = {
      session: {
        market: session.market,
        symbol: session.symbol,
        timeframe: session.timeframe,
        mode: session.mode,
        objectives: (session.settings as any)?.objectives ?? [],
      },
      totals,
      score: score ? { overall: score.score, discipline: score.discipline, risk: score.risk, execution: score.execution, patience: score.patience, consistency: score.consistency } : null,
      best_trade: bestTrade
        ? {
            symbol: bestTrade.symbol,
            direction: bestTrade.direction,
            pnl: bestTrade.pnl,
            rr: bestTrade.rr_realized,
          }
        : null,
      worst_trade: worstTrade
        ? {
            symbol: worstTrade.symbol,
            direction: worstTrade.direction,
            pnl: worstTrade.pnl,
            rr: worstTrade.rr_realized,
          }
        : null,
      checklist: {
        ticked: (checklist ?? []).filter((c: any) => c.checked).length,
        total: (checklist ?? []).length,
        items: (checklist ?? []).map((c: any) => ({ label: c.label, checked: c.checked })),
      },
      bookmarks_count: (bookmarks ?? []).length,
      notes_count: (notes ?? []).length,
      notes_sample: (notes ?? []).slice(0, 5).map((n: any) => n.body),
      detected_mistakes: (mistakes ?? []).map((m: any) => ({ kind: m.kind, severity: m.severity, evidence: m.evidence })),
    };

    const prompt = `Review this replay session and produce a coaching debrief.
Use the exact numbers provided. Grade honestly (A+ down to F).
Session data:
${JSON.stringify(summary, null, 2)}`;

    const out = await safeStructured(ReplayDebriefSchema, prompt);
    if (!out) throw new Error("Debrief generation failed");

    const row = {
      user_id: context.userId,
      session_id: data.session_id,
      overall_summary: out.overall_summary,
      strengths: out.strengths,
      weaknesses: out.weaknesses,
      best_trade: out.best_trade,
      worst_trade: out.worst_trade,
      risk_review: out.risk_review,
      execution_review: out.execution_review,
      discipline_review: out.discipline_review,
      psychology_review: out.psychology_review,
      improvement_suggestions: out.improvement_suggestions,
      action_items: out.action_items,
      grade: out.grade,
      confidence: out.confidence,
      model: DEFAULT_MODEL,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("replay_debriefs")
      .upsert(row, { onConflict: "session_id" })
      .select()
      .single();
    if (error) throw error;

    // Feed coach memory
    for (const w of out.weaknesses.slice(0, 3)) {
      await context.supabase.from("replay_coach_memory").upsert(
        {
          user_id: context.userId,
          kind: "weakness",
          key: w.slice(0, 120),
          value: { session_id: data.session_id },
          last_seen_at: new Date().toISOString(),
          weight: 1,
        },
        { onConflict: "user_id,kind,key" },
      );
    }
    return saved;
  });

export const getReplayDebrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("replay_debriefs")
      .select("*")
      .eq("session_id", data.session_id)
      .maybeSingle();
    return row;
  });

export const listReplayDebriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().max(50).default(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("replay_debriefs")
      .select("id,session_id,grade,confidence,overall_summary,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

/* ============ homework ============ */

export const generateHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rl = await enforceAiRateLimit(context.supabase, context.userId, ["review_per_day"]);
    if (!rl.ok) throw new Error("AI rate limit exceeded");

    const [{ data: profile }, { data: mistakes }] = await Promise.all([
      context.supabase.from("replay_trader_profile").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("replay_mistakes")
        .select("kind,severity")
        .eq("user_id", context.userId)
        .order("detected_at", { ascending: false })
        .limit(200),
    ]);
    const patterns = (profile?.snapshot as any)?.patterns ?? null;

    const prompt = `Prescribe ONE practice homework replay for this trader.
Base it on their weakest area from the profile and recent mistakes.
Trader profile:
${JSON.stringify({ style: profile?.style, weaknesses: profile?.weaknesses, scores: profile?.snapshot }, null, 2)}
Recent mistake counts:
${JSON.stringify(countBy(mistakes ?? [], (m: any) => m.kind), null, 2)}
Patterns:
${JSON.stringify(patterns, null, 2)}
Pick a real market/symbol/timeframe combo the trader has historical data for.`;

    const out = await safeStructured(HomeworkSchema, prompt);
    if (!out) throw new Error("Homework generation failed");
    const { data: row, error } = await context.supabase
      .from("replay_homework")
      .insert({
        user_id: context.userId,
        market: out.market,
        symbol: out.symbol,
        timeframe: out.timeframe,
        session_hint: out.session_hint,
        difficulty: out.difficulty,
        target_r: out.target_r,
        max_trades: out.max_trades,
        reason: out.reason,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listHomework = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_homework")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const updateHomeworkStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "in_progress", "completed", "skipped"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status };
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("replay_homework")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============ recommendations ============ */

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rl = await enforceAiRateLimit(context.supabase, context.userId, ["review_per_day"]);
    if (!rl.ok) throw new Error("AI rate limit exceeded");

    const { sessions, trades, mistakes } = await loadPatternInputs(context.supabase, context.userId, 60);
    const patterns = computePatterns({ sessions: sessions as any, trades: trades as any });
    const mistakeCounts = countBy(mistakes ?? [], (m: any) => m.kind);

    const prompt = `Produce 3 to 5 personalized coaching recommendations for this trader.
Everything must reference the numbers below. No generic advice.
Patterns:
${JSON.stringify(patterns, null, 2)}
Mistake frequency:
${JSON.stringify(mistakeCounts, null, 2)}
Total sessions: ${sessions.length}. Total trades: ${trades.length}.`;

    const out = await safeStructured(CoachRecommendationsSchema, prompt);
    if (!out) throw new Error("Recommendation generation failed");

    // Replace active (non-dismissed) recommendations to avoid pileup.
    await context.supabase
      .from("replay_recommendations")
      .delete()
      .eq("user_id", context.userId)
      .is("dismissed_at", null);
    if (out.recommendations.length > 0) {
      await context.supabase.from("replay_recommendations").insert(
        out.recommendations.map((r) => ({
          user_id: context.userId,
          kind: r.kind,
          title: r.title,
          description: r.description,
          priority: r.priority,
          evidence: { patterns, mistakes: mistakeCounts },
        })),
      );
    }
    return out.recommendations;
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_recommendations")
      .select("*")
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const dismissRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("replay_recommendations")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============ reports ============ */

export const generateCoachReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ period: z.enum(["weekly", "monthly"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const rl = await enforceAiRateLimit(context.supabase, context.userId, ["review_per_day"]);
    if (!rl.ok) throw new Error("AI rate limit exceeded");

    const days = data.period === "weekly" ? 7 : 30;
    const start = new Date(Date.now() - days * 86400_000);
    const end = new Date();
    const startIso = start.toISOString();

    const [{ data: sessions }, { data: trades }, { data: mistakes }, { data: scores }] =
      await Promise.all([
        context.supabase
          .from("replay_sessions")
          .select("id,market,symbol,timeframe,mode,created_at")
          .eq("user_id", context.userId)
          .gte("created_at", startIso),
        context.supabase
          .from("replay_trades")
          .select("session_id,pnl,rr_realized,opened_at")
          .eq("user_id", context.userId)
          .gte("opened_at", startIso),
        context.supabase
          .from("replay_mistakes")
          .select("kind,severity")
          .eq("user_id", context.userId)
          .gte("detected_at", startIso),
        context.supabase
          .from("replay_scores")
          .select("session_id,score"),
      ]);

    const scoreMap = new Map<string, number>();
    (scores ?? []).forEach((s: any) => scoreMap.set(s.session_id, Number(s.score) || 0));
    const scored = (sessions ?? []).map((s: any) => ({ ...s, _score: scoreMap.get(s.id) ?? 0 }));
    const best = [...scored].sort((a, b) => b._score - a._score)[0] ?? null;
    const worst = [...scored].filter((s) => s._score > 0).sort((a, b) => a._score - b._score)[0] ?? null;
    const closed = (trades ?? []).filter((t: any) => t.pnl != null);
    const wins = closed.filter((t: any) => t.pnl > 0).length;

    const stats = {
      sessions_count: (sessions ?? []).length,
      trades_count: closed.length,
      win_rate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
      avg_score: scored.length
        ? Math.round(scored.reduce((s, r) => s + r._score, 0) / scored.length)
        : 0,
      mistake_counts: countBy(mistakes ?? [], (m: any) => m.kind),
      best_session_id: best?.id ?? null,
      worst_session_id: worst?.id ?? null,
    };

    const prompt = `Write a ${data.period} coaching report for this trader.
Anchor everything to the numbers provided.
Period: ${start.toDateString()} → ${end.toDateString()}
Stats: ${JSON.stringify(stats, null, 2)}`;

    const out = await safeStructured(CoachReportSchema, prompt);
    if (!out) throw new Error("Report generation failed");

    const row = {
      user_id: context.userId,
      period: data.period,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      biggest_improvement: out.biggest_improvement,
      biggest_weakness: out.biggest_weakness,
      best_session_id: stats.best_session_id,
      worst_session_id: stats.worst_session_id,
      homework_recommendation: out.homework_recommendation,
      next_focus: out.next_focus,
      stats,
      body: out,
    };
    const { data: saved, error } = await context.supabase
      .from("replay_coach_reports")
      .upsert(row, { onConflict: "user_id,period,period_start" })
      .select()
      .single();
    if (error) throw error;
    return saved;
  });

export const listCoachReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_coach_reports")
      .select("*")
      .eq("user_id", context.userId)
      .order("period_start", { ascending: false })
      .limit(50);
    return data ?? [];
  });

/* ============ memory + evolution ============ */

export const getCoachMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_coach_memory")
      .select("*")
      .eq("user_id", context.userId)
      .order("weight", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const getReplayEvolution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: firstArr }, { data: latestArr }, { data: history }] = await Promise.all([
      context.supabase
        .from("replay_sessions")
        .select("id,created_at,symbol,market,timeframe")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: true })
        .limit(1),
      context.supabase
        .from("replay_sessions")
        .select("id,created_at,symbol,market,timeframe")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("replay_scores")
        .select("session_id,score")
        .eq("user_id", context.userId),
    ]);
    const scoreMap = new Map<string, number>();
    (history ?? []).forEach((s: any) => scoreMap.set(s.session_id, Number(s.score) || 0));
    const first = firstArr?.[0]
      ? { ...firstArr[0], score: scoreMap.get(firstArr[0].id) ?? 0 }
      : null;
    const latest = latestArr?.[0]
      ? { ...latestArr[0], score: scoreMap.get(latestArr[0].id) ?? 0 }
      : null;

    // Trend series: session in order
    const { data: allSessions } = await context.supabase
      .from("replay_sessions")
      .select("id,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(500);
    const series = (allSessions ?? []).map((s: any) => ({
      at: s.created_at,
      score: scoreMap.get(s.id) ?? 0,
    }));
    return { first, latest, series, count: series.length };
  });

/* ============ improvement tracking ============ */

export const computeImprovementTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ period: z.enum(["weekly", "monthly", "quarterly", "yearly"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const daysBy = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 } as const;
    const win = daysBy[data.period];
    const cutoff = new Date(Date.now() - win * 86400_000).toISOString();
    const prevCutoff = new Date(Date.now() - win * 2 * 86400_000).toISOString();

    async function bucket(sinceIso: string, untilIso?: string) {
      let q1 = context.supabase
        .from("replay_scores")
        .select("score,updated_at")
        .eq("user_id", context.userId)
        .gte("updated_at", sinceIso);
      if (untilIso) q1 = q1.lt("updated_at", untilIso);
      const { data: scores } = await q1;
      let q2 = context.supabase
        .from("replay_trades")
        .select("pnl,rr_realized")
        .eq("user_id", context.userId)
        .gte("opened_at", sinceIso);
      if (untilIso) q2 = q2.lt("opened_at", untilIso);
      const { data: trades } = await q2;
      let q3 = context.supabase
        .from("replay_mistakes")
        .select("id")
        .eq("user_id", context.userId)
        .gte("detected_at", sinceIso);
      if (untilIso) q3 = q3.lt("detected_at", untilIso);
      const { data: mistakes } = await q3;
      const closed = (trades ?? []).filter((t: any) => t.pnl != null);
      const wins = closed.filter((t: any) => t.pnl > 0).length;
      return {
        avg_score: scores?.length
          ? Math.round(scores.reduce((s: number, r: any) => s + (r.score ?? 0), 0) / scores.length)
          : 0,
        avg_rr: closed.length
          ? Number(
              (closed.reduce((s: number, t: any) => s + (t.rr_realized ?? 0), 0) / closed.length).toFixed(2),
            )
          : 0,
        win_rate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
        mistakes: (mistakes ?? []).length,
      };
    }
    const cur = await bucket(cutoff);
    const prev = await bucket(prevCutoff, cutoff);
    return {
      period: data.period,
      current: cur,
      previous: prev,
      deltas: {
        avg_score: cur.avg_score - prev.avg_score,
        avg_rr: Number((cur.avg_rr - prev.avg_rr).toFixed(2)),
        win_rate: cur.win_rate - prev.win_rate,
        mistakes: cur.mistakes - prev.mistakes,
      },
    };
  });

/* ============ orchestration ============ */

export const runCoachOnSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // 1. Deterministic — always
    await context.supabase.from("replay_mistakes").delete().eq("session_id", data.session_id);
    const [{ data: trades }, { data: session }] = await Promise.all([
      context.supabase
        .from("replay_trades")
        .select("id,status,entry_price,exit_price,stop_loss,take_profit,risk_pct,rr_realized,rr_planned,pnl,direction,opened_at,closed_at")
        .eq("session_id", data.session_id),
      context.supabase
        .from("replay_sessions")
        .select("id,symbol,timeframe")
        .eq("id", data.session_id)
        .maybeSingle(),
    ]);
    const detected = detectReplayMistakes({
      trades: (trades ?? []) as any,
      symbol: session?.symbol,
      timeframe: session?.timeframe,
    });
    if (detected.length > 0) {
      await context.supabase.from("replay_mistakes").insert(
        detected.map((m) => ({
          user_id: context.userId,
          session_id: data.session_id,
          trade_id: m.trade_id,
          kind: m.kind,
          severity: m.severity,
          evidence: m.evidence,
        })),
      );
    }
    return { ok: true, mistakes: detected.length };
  });

/* ============ utils ============ */

function countBy<T>(rows: T[], keyFn: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFn(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export { sessionHourBucket };
