/**
 * AI Trading Coach — server functions.
 * Uses the Lovable AI Gateway via the AI SDK. All model calls stay server-side.
 * Provider abstraction: prompts/models are resolved from DB (ai_providers, ai_models,
 * ai_prompt_templates + versions) so future providers can be plugged in without code changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
} from "@/lib/ai-gateway.server";
import {
  COACH_SYSTEM_PROMPT,
  TradeReviewSchema,
  JournalReviewSchema,
  PsychologySchema,
  PerformanceSchema,
  ReportSchema,
  PlaybookSchema,
  RecommendationsSchema,
} from "@/lib/ai/prompts";
import { computeAiScore, type ScoreInputs } from "@/lib/ai/score";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "@/lib/ai/constants";

// -----------------------------------------------------------------------------
// Gateway helper
// -----------------------------------------------------------------------------
function requireLovableKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured on server.");
  return key;
}

async function runStructured<T>(args: {
  modelKey: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<{ output: T; tokensIn: number; tokensOut: number; latencyMs: number; runId?: string }> {
  const key = requireLovableKey();
  const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: true });
  const model = gateway(args.modelKey);
  const started = Date.now();
  try {
    const result = await generateText({
      model,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
      // maxOutputTokens is optional; the SDK also respects the provider default
    });
    return {
      output: result.output as T,
      tokensIn: result.usage?.inputTokens ?? 0,
      tokensOut: result.usage?.outputTokens ?? 0,
      latencyMs: Date.now() - started,
      runId: gateway.getRunId(),
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      try {
        const parsed = JSON.parse((err as { text?: string }).text ?? "{}");
        const validated = args.schema.parse(parsed);
        return {
          output: validated,
          tokensIn: (err as { usage?: { inputTokens?: number } }).usage?.inputTokens ?? 0,
          tokensOut: (err as { usage?: { outputTokens?: number } }).usage?.outputTokens ?? 0,
          latencyMs: Date.now() - started,
          runId: gateway.getRunId(),
        };
      } catch {
        // fallthrough
      }
    }
    throw err;
  }
}

async function logUsage(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth extends never ? never : never>> | any,
  userId: string,
  kind: string,
  modelKey: string,
  info: { tokensIn: number; tokensOut: number; latencyMs: number; runId?: string; ok: boolean; error?: string },
) {
  await supabase.from("ai_usage_logs").insert({
    user_id: userId,
    kind,
    model_key: modelKey,
    provider_key: DEFAULT_PROVIDER,
    tokens_in: info.tokensIn,
    tokens_out: info.tokensOut,
    run_id: info.runId,
    latency_ms: info.latencyMs,
    ok: info.ok,
    error: info.error,
  });
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------
export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("ai_settings").select("*").eq("user_id", userId).maybeSingle();
    if (data) return data;
    const { data: created } = await supabase
      .from("ai_settings")
      .insert({ user_id: userId })
      .select("*")
      .single();
    return created;
  });

const settingsSchema = z.object({
  preferred_provider: z.string().optional(),
  preferred_model: z.string().optional(),
  analysis_depth: z.enum(["basic", "standard", "deep"]).optional(),
  auto_analyze_trades: z.boolean().optional(),
  auto_journal_review: z.boolean().optional(),
  auto_weekly_report: z.boolean().optional(),
  auto_monthly_report: z.boolean().optional(),
  share_data_with_ai: z.boolean().optional(),
  opt_out: z.boolean().optional(),
  smart_alerts: z.boolean().optional(),
});

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_settings")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

// -----------------------------------------------------------------------------
// Providers/Models catalog
// -----------------------------------------------------------------------------
export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: providers } = await context.supabase
      .from("ai_providers")
      .select("*")
      .order("sort_order");
    const { data: models } = await context.supabase
      .from("ai_models")
      .select("*")
      .order("sort_order");
    return { providers: providers ?? [], models: models ?? [] };
  });

// -----------------------------------------------------------------------------
// Data-fetch helpers (context builders)
// -----------------------------------------------------------------------------
async function fetchScoreInputs(supabase: any, userId: string, windowDays = 30): Promise<ScoreInputs> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const [{ data: trades }, { data: journals }, { data: challenges }] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("id, pnl, risk_amount, rr_realized, stop_loss, status, closed_at, opened_at")
      .eq("user_id", userId)
      .gte("opened_at", since)
      .is("deleted_at", null),
    supabase
      .from("journal_entries")
      .select("id, trade_id, notes, created_at, mistakes, emotions_pre, emotions_post, status")
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("user_challenges")
      .select("id, status")
      .eq("user_id", userId),
  ]);

  const closedTrades = (trades ?? []).filter((t: any) => t.status === "closed");
  const wins = closedTrades.filter((t: any) => (t.pnl ?? 0) > 0).length;
  const losses = closedTrades.filter((t: any) => (t.pnl ?? 0) < 0).length;
  const totalPnl = closedTrades.reduce((s: number, t: any) => s + Number(t.pnl ?? 0), 0);
  const totalRisk = closedTrades.reduce((s: number, t: any) => s + Math.abs(Number(t.risk_amount ?? 0)), 0);
  const totalRR = closedTrades.reduce((s: number, t: any) => s + Number(t.rr_realized ?? 0), 0);
  const averageRR = closedTrades.length ? totalRR / closedTrades.length : 0;
  const tradesWithStops = closedTrades.filter((t: any) => t.stop_loss != null).length;
  const tradesRespectingRisk = closedTrades.filter((t: any) => Math.abs(Number(t.risk_amount ?? 0)) > 0).length;
  const tradeIds = new Set(closedTrades.map((t: any) => t.id));
  const journaledTrades = (journals ?? []).filter((j: any) => j.trade_id && tradeIds.has(j.trade_id)).length;
  const totalJournalWords = (journals ?? []).reduce(
    (s: number, j: any) => s + String(j.notes ?? "").split(/\s+/).filter(Boolean).length,
    0,
  );
  const tradingDays = new Set(closedTrades.map((t: any) => (t.opened_at ?? "").slice(0, 10))).size;
  const journalingDays = new Set((journals ?? []).map((j: any) => (j.created_at ?? "").slice(0, 10))).size;

  // Drawdown: simple running from equity curve
  let peak = 0;
  let equity = 0;
  let maxDD = 0;
  for (const t of closedTrades.sort(
    (a: any, b: any) => new Date(a.closed_at ?? 0).getTime() - new Date(b.closed_at ?? 0).getTime(),
  )) {
    equity += Number(t.pnl ?? 0);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const activeChallenges = (challenges ?? []).filter((c: any) => c.status === "active").length;
  const completedChallenges = (challenges ?? []).filter((c: any) => c.status === "completed").length;

  return {
    totalTrades: closedTrades.length,
    wins,
    losses,
    totalPnl,
    totalRisk,
    averageRR,
    maxDrawdown: maxDD,
    journaledTrades,
    totalJournalWords,
    tradesWithStops,
    tradesRespectingRisk,
    activeChallenges,
    completedChallenges,
    tradingDays,
    journalingDays,
    loginDays: tradingDays, // approximation until session tracking
    windowDays,
  };
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
export const getAiDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const inputs = await fetchScoreInputs(supabase, userId, 30);
    const score = computeAiScore(inputs);

    const [snapshotRes, latestReviews, latestReport, recs, alerts, sessions] = await Promise.all([
      supabase.from("ai_score_snapshots").insert({ user_id: userId, ...score }).select("*").single(),
      supabase.from("ai_trade_reviews").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      supabase.from("ai_reports").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_recommendations").select("*").eq("user_id", userId).eq("status", "open").order("priority").limit(6),
      supabase.from("ai_alerts").select("*").eq("user_id", userId).eq("acknowledged", false).order("created_at", { ascending: false }).limit(10),
      supabase.from("ai_chat_sessions").select("id, title, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5),
    ]);

    const { data: history } = await supabase
      .from("ai_score_snapshots")
      .select("computed_at, overall, discipline, risk_management, consistency, execution, psychology, journal_quality, performance, challenge_completion")
      .eq("user_id", userId)
      .order("computed_at", { ascending: false })
      .limit(30);

    return {
      score: snapshotRes.data ?? score,
      inputs,
      history: (history ?? []).reverse(),
      recentReviews: latestReviews.data ?? [],
      latestReport: latestReport.data ?? null,
      recommendations: recs.data ?? [],
      alerts: alerts.data ?? [],
      chatSessions: sessions.data ?? [],
    };
  });

// -----------------------------------------------------------------------------
// Trade Review
// -----------------------------------------------------------------------------
export const reviewTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tradeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trade, error } = await supabase
      .from("paper_trades")
      .select("*")
      .eq("id", data.tradeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !trade) throw new Error("Trade not found");

    const { data: journal } = await supabase
      .from("journal_entries")
      .select("notes, mistakes, emotions_pre, emotions_post, rating")
      .eq("trade_id", trade.id)
      .maybeSingle();

    const settings = await supabase.from("ai_settings").select("*").eq("user_id", userId).maybeSingle();
    const modelKey = settings.data?.preferred_model ?? DEFAULT_MODEL;

    const prompt = `Analyze this closed trade in depth.

TRADE
  Symbol: ${trade.symbol}
  Market: ${trade.market}
  Direction: ${trade.direction}
  Entry: ${trade.entry_price}
  Exit: ${trade.exit_price ?? "n/a"}
  Stop loss: ${trade.stop_loss ?? "none"}
  Take profit: ${trade.take_profit ?? "none"}
  Lot size: ${trade.lot_size}
  PnL: ${trade.pnl ?? 0}
  R:R planned: ${trade.rr_planned ?? "?"} / realized: ${trade.rr_realized ?? "?"}
  Risk amount: ${trade.risk_amount ?? "?"}
  Opened: ${trade.opened_at}  Closed: ${trade.closed_at}
  Close reason: ${trade.close_reason ?? "manual"}
  Notes: ${trade.notes ?? "(none)"}

JOURNAL
${journal ? JSON.stringify(journal) : "(no journal entry)"}

Grade the trade (A+..F), give confidence 0-100, and produce the structured review.`;

    try {
      const res = await runStructured({
        modelKey,
        system: COACH_SYSTEM_PROMPT,
        prompt,
        schema: TradeReviewSchema,
      });

      // supersede previous
      await supabase
        .from("ai_trade_reviews")
        .update({ superseded_by: null })
        .eq("trade_id", trade.id)
        .eq("user_id", userId);

      const { data: inserted, error: insErr } = await supabase
        .from("ai_trade_reviews")
        .insert({
          user_id: userId,
          trade_id: trade.id,
          model_key: modelKey,
          provider_key: DEFAULT_PROVIDER,
          prompt_template_key: "trade_review",
          prompt_version: 1,
          grade: res.output.grade,
          confidence: res.output.confidence,
          summary: res.output.summary,
          strengths: res.output.strengths,
          mistakes: res.output.mistakes,
          execution_review: res.output.execution_review,
          risk_review: res.output.risk_review,
          psychology_review: res.output.psychology_review,
          alternative_entries: res.output.alternative_entries,
          alternative_exits: res.output.alternative_exits,
          better_stop: res.output.better_stop,
          suggested_take_profit: res.output.suggested_take_profit,
          missed_opportunities: res.output.missed_opportunities,
          raw: res.output as any,
          tokens_in: res.tokensIn,
          tokens_out: res.tokensOut,
          latency_ms: res.latencyMs,
        })
        .select("*")
        .single();
      if (insErr) throw insErr;

      await logUsage(supabase, userId, "trade_review", modelKey, {
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        latencyMs: res.latencyMs,
        runId: res.runId,
        ok: true,
      });
      return inserted;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logUsage(supabase, userId, "trade_review", modelKey, {
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        ok: false,
        error: msg,
      });
      throw new Error(msg);
    }
  });

// -----------------------------------------------------------------------------
// Journal Review
// -----------------------------------------------------------------------------
export const reviewJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ journalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", data.journalId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!entry) throw new Error("Journal entry not found");

    const settings = await supabase.from("ai_settings").select("preferred_model").eq("user_id", userId).maybeSingle();
    const modelKey = settings.data?.preferred_model ?? DEFAULT_MODEL;

    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt: `Evaluate this journal entry for quality, completeness, psychology, risk, emotion and consistency. Provide scores 0-100.

${JSON.stringify(entry, null, 2)}`,
      schema: JournalReviewSchema,
    });

    const { data: row, error: err } = await supabase
      .from("ai_journal_reviews")
      .insert({
        user_id: userId,
        journal_id: entry.id,
        model_key: modelKey,
        provider_key: DEFAULT_PROVIDER,
        ...res.output,
        raw: res.output as any,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
      })
      .select("*")
      .single();
    if (err) throw err;
    await logUsage(supabase, userId, "journal_review", modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return row;
  });

// -----------------------------------------------------------------------------
// Psychology Analysis
// -----------------------------------------------------------------------------
export const runPsychologyAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.number().min(7).max(180).default(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const [{ data: trades }, { data: journals }] = await Promise.all([
      supabase
        .from("paper_trades")
        .select("id, symbol, direction, pnl, closed_at, notes")
        .eq("user_id", userId)
        .gte("opened_at", since)
        .eq("status", "closed")
        .is("deleted_at", null),
      supabase
        .from("journal_entries")
        .select("notes, mistakes, emotions_pre, emotions_post, rating, created_at")
        .eq("user_id", userId)
        .gte("created_at", since),
    ]);

    const modelKey = DEFAULT_MODEL;
    const prompt = `Analyze emotional patterns across the last ${data.days} days.

TRADES (${trades?.length ?? 0}):
${JSON.stringify((trades ?? []).slice(0, 60))}

JOURNAL (${journals?.length ?? 0}):
${JSON.stringify((journals ?? []).slice(0, 60))}

Return emotion scores 0-100 for fear, greed, fomo, revenge, overconfidence, impatience, discipline, confidence. List detected patterns with severity (low/medium/high). Then correlate emotion vs profit.`;

    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt,
      schema: PsychologySchema,
    });

    // Build timeline & heatmap from actual data
    const timeline = (journals ?? []).map((j: any) => ({
      day: (j.created_at ?? "").slice(0, 10),
      rating: j.rating ?? null,
      pre: j.emotions_pre ?? [],
      post: j.emotions_post ?? [],
    }));
    const heatmap: Record<string, number> = {};
    for (const t of trades ?? []) {
      const day = (t.closed_at ?? "").slice(0, 10);
      if (!day) continue;
      heatmap[day] = (heatmap[day] ?? 0) + (Number(t.pnl ?? 0) > 0 ? 1 : -1);
    }

    const { data: row, error: err } = await supabase
      .from("ai_psychology_reviews")
      .insert({
        user_id: userId,
        period_start: since,
        period_end: new Date().toISOString(),
        model_key: modelKey,
        provider_key: DEFAULT_PROVIDER,
        summary: res.output.summary,
        emotions: res.output.emotions,
        patterns: res.output.patterns,
        timeline,
        heatmap,
        emotion_vs_profit: res.output.emotion_vs_profit,
        raw: res.output as any,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
      })
      .select("*")
      .single();
    if (err) throw err;
    await logUsage(supabase, userId, "psychology", modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return row;
  });

export const getLatestPsychology = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_psychology_reviews")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });

// -----------------------------------------------------------------------------
// Performance
// -----------------------------------------------------------------------------
export const runPerformanceAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.number().min(7).max(365).default(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { data: trades } = await supabase
      .from("paper_trades")
      .select("symbol, market, direction, pnl, rr_realized, opened_at, closed_at")
      .eq("user_id", userId)
      .gte("opened_at", since)
      .eq("status", "closed")
      .is("deleted_at", null);

    // Aggregate by pair, session, hour, day
    const bySymbol: Record<string, { pnl: number; count: number }> = {};
    const byHour: Record<string, { pnl: number; count: number }> = {};
    const byDay: Record<string, { pnl: number; count: number }> = {};
    for (const t of trades ?? []) {
      const s = t.symbol as string;
      bySymbol[s] = bySymbol[s] ?? { pnl: 0, count: 0 };
      bySymbol[s].pnl += Number(t.pnl ?? 0);
      bySymbol[s].count += 1;
      const d = new Date(t.opened_at as string);
      const hr = String(d.getUTCHours()).padStart(2, "0");
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
      byHour[hr] = byHour[hr] ?? { pnl: 0, count: 0 };
      byHour[hr].pnl += Number(t.pnl ?? 0);
      byHour[hr].count += 1;
      byDay[dow] = byDay[dow] ?? { pnl: 0, count: 0 };
      byDay[dow].pnl += Number(t.pnl ?? 0);
      byDay[dow].count += 1;
    }

    const modelKey = DEFAULT_MODEL;
    const prompt = `Analyze this trader's aggregate performance across the last ${data.days} days.

By symbol: ${JSON.stringify(bySymbol)}
By hour (UTC): ${JSON.stringify(byHour)}
By day-of-week: ${JSON.stringify(byDay)}
Total closed trades: ${trades?.length ?? 0}

Detect best/worst sessions (Asian/London/NY), strategies (from patterns), pairs, days, times. Provide specific suggestions.`;

    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt,
      schema: PerformanceSchema,
    });

    const { data: row, error: err } = await supabase
      .from("ai_performance_reviews")
      .insert({
        user_id: userId,
        period_start: since,
        period_end: new Date().toISOString(),
        model_key: modelKey,
        provider_key: DEFAULT_PROVIDER,
        ...res.output,
        raw: res.output as any,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
      })
      .select("*")
      .single();
    if (err) throw err;
    await logUsage(supabase, userId, "performance", modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return row;
  });

export const getLatestPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_performance_reviews")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });

// -----------------------------------------------------------------------------
// Reports
// -----------------------------------------------------------------------------
export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ period: z.enum(["weekly", "monthly", "quarterly", "annual"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = { weekly: 7, monthly: 30, quarterly: 90, annual: 365 }[data.period];
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const inputs = await fetchScoreInputs(supabase, userId, days);
    const score = computeAiScore(inputs);
    const modelKey = DEFAULT_MODEL;

    const prompt = `Generate the ${data.period} trader review.

METRICS
${JSON.stringify(inputs, null, 2)}

AI SCORE
${JSON.stringify(score, null, 2)}

Write an honest, constructive review. Include specific wins, losses, biggest improvement, biggest weakness, and 3-5 recommended goals with metric targets.`;

    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt,
      schema: ReportSchema,
    });

    const { data: row, error: err } = await supabase
      .from("ai_reports")
      .insert({
        user_id: userId,
        period: data.period,
        period_start: since,
        period_end: new Date().toISOString(),
        model_key: modelKey,
        provider_key: DEFAULT_PROVIDER,
        title: res.output.title,
        summary: res.output.summary,
        wins: res.output.wins,
        losses: res.output.losses,
        biggest_improvement: res.output.biggest_improvement,
        biggest_weakness: res.output.biggest_weakness,
        recommended_goals: res.output.recommended_goals,
        metrics: { inputs, score } as any,
        raw: res.output as any,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
      })
      .select("*")
      .single();
    if (err) throw err;
    await logUsage(supabase, userId, `${data.period}_report` as any, modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return row;
  });

// -----------------------------------------------------------------------------
// Playbooks
// -----------------------------------------------------------------------------
export const generatePlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ topic: z.string().min(3).max(200), category: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trades } = await supabase
      .from("paper_trades")
      .select("symbol, direction, pnl, notes")
      .eq("user_id", userId)
      .eq("status", "closed")
      .is("deleted_at", null)
      .order("closed_at", { ascending: false })
      .limit(50);

    const modelKey = DEFAULT_MODEL;
    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt: `Generate a personalized trading playbook for: "${data.topic}".
Category hint: ${data.category ?? "general"}
Use insights from these recent trades: ${JSON.stringify(trades ?? [])}`,
      schema: PlaybookSchema,
    });

    const { data: row, error: err } = await supabase
      .from("ai_playbooks")
      .insert({
        user_id: userId,
        title: res.output.title,
        category: res.output.category,
        description: res.output.description,
        rules: res.output.rules,
        checklist: res.output.checklist,
        examples: res.output.examples,
        mistakes_to_avoid: res.output.mistakes_to_avoid,
        review_frequency: res.output.review_frequency,
        source: "ai_generated",
        model_key: modelKey,
        provider_key: DEFAULT_PROVIDER,
        raw: res.output as any,
      })
      .select("*")
      .single();
    if (err) throw err;
    await logUsage(supabase, userId, "playbook", modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return row;
  });

export const listPlaybooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_playbooks")
      .select("*")
      .eq("user_id", context.userId)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const togglePlaybookPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("ai_playbooks")
      .update({ pinned: data.pinned })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const deletePlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("ai_playbooks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Recommendations
// -----------------------------------------------------------------------------
export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const inputs = await fetchScoreInputs(supabase, userId, 30);
    const score = computeAiScore(inputs);
    const modelKey = DEFAULT_MODEL;
    const res = await runStructured({
      modelKey,
      system: COACH_SYSTEM_PROMPT,
      prompt: `Generate 5-8 personalized recommendations. Rank by priority (critical > high > medium > low), rate impact 1-5 and difficulty 1-5.

METRICS: ${JSON.stringify(inputs)}
SCORE: ${JSON.stringify(score)}`,
      schema: RecommendationsSchema,
    });

    // Clear stale open recommendations and insert new set
    await supabase
      .from("ai_recommendations")
      .update({ status: "expired" })
      .eq("user_id", userId)
      .eq("status", "open");

    const rows = res.output.recommendations.map((r) => ({
      user_id: userId,
      title: r.title,
      description: r.description,
      priority: r.priority,
      impact: r.impact,
      difficulty: r.difficulty,
      category: r.category,
      model_key: modelKey,
      provider_key: DEFAULT_PROVIDER,
    }));
    const { data: inserted, error } = await supabase.from("ai_recommendations").insert(rows).select("*");
    if (error) throw error;
    await logUsage(supabase, userId, "recommendation", modelKey, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      runId: res.runId,
      ok: true,
    });
    return inserted;
  });

export const updateRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "completed", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    if (data.status === "dismissed") patch.dismissed_at = new Date().toISOString();
    await context.supabase
      .from("ai_recommendations")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Chat sessions
// -----------------------------------------------------------------------------
export const listChatSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("user_id", context.userId)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    return data ?? [];
  });

export const createChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ title: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_chat_sessions")
      .insert({
        user_id: context.userId,
        title: data.title ?? "New conversation",
        model_key: DEFAULT_MODEL,
        provider_key: DEFAULT_PROVIDER,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("ai_chat_sessions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const getChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: session } = await context.supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!session) throw new Error("Session not found");
    const { data: msgs } = await context.supabase
      .from("ai_chat_messages")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });
    return { session, messages: msgs ?? [] };
  });

// -----------------------------------------------------------------------------
// History
// -----------------------------------------------------------------------------
export const listAiHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [reviews, reports, psych, perf, recs] = await Promise.all([
      context.supabase.from("ai_trade_reviews").select("id, created_at, grade, summary, trade_id").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("ai_reports").select("id, created_at, period, title, summary").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("ai_psychology_reviews").select("id, created_at, summary").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("ai_performance_reviews").select("id, created_at, summary").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("ai_recommendations").select("id, created_at, title, priority, status").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      trades: reviews.data ?? [],
      reports: reports.data ?? [],
      psychology: psych.data ?? [],
      performance: perf.data ?? [],
      recommendations: recs.data ?? [],
    };
  });

// -----------------------------------------------------------------------------
// Alerts
// -----------------------------------------------------------------------------
export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_alerts")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("ai_alerts")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Trade Reviews list (for /ai/trade-review)
// -----------------------------------------------------------------------------
export const listReviewableTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: trades } = await context.supabase
      .from("paper_trades")
      .select("id, symbol, direction, market, pnl, opened_at, closed_at, rr_realized")
      .eq("user_id", context.userId)
      .eq("status", "closed")
      .is("deleted_at", null)
      .order("closed_at", { ascending: false })
      .limit(100);
    const { data: reviews } = await context.supabase
      .from("ai_trade_reviews")
      .select("id, trade_id, grade, confidence, summary, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    const byTrade = new Map<string, any>();
    for (const r of reviews ?? []) if (!byTrade.has(r.trade_id)) byTrade.set(r.trade_id, r);
    return (trades ?? []).map((t: any) => ({ ...t, review: byTrade.get(t.id) ?? null }));
  });

export const getTradeReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tradeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: trade } = await context.supabase
      .from("paper_trades")
      .select("*")
      .eq("id", data.tradeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: review } = await context.supabase
      .from("ai_trade_reviews")
      .select("*")
      .eq("trade_id", data.tradeId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { trade, review };
  });

// Re-export for chat route
export { requireLovableKey };
export { getLovableAiGatewayResponseHeaders };
