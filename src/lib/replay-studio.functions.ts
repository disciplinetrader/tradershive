/**
 * Replay Studio — server functions for Random Sessions, AI Review,
 * Challenge listing/join, and Session Summary.
 * All rows are user-scoped via RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { DEFAULT_MODEL } from "@/lib/ai/constants";
import { TIMEFRAME_SECONDS } from "@/lib/replay/constants";

// ---------- Challenges ----------

export const listReplayChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: challenges }, { data: mine }] = await Promise.all([
      context.supabase
        .from("replay_challenges")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      context.supabase
        .from("user_replay_challenges")
        .select("*")
        .eq("user_id", context.userId),
    ]);
    const byChallenge = new Map<string, any>();
    (mine ?? []).forEach((r: any) => byChallenge.set(r.challenge_id, r));
    return (challenges ?? []).map((c: any) => ({
      ...c,
      progress: byChallenge.get(c.id) ?? null,
    }));
  });

export const joinReplayChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ challenge_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("user_replay_challenges")
      .upsert(
        {
          user_id: context.userId,
          challenge_id: data.challenge_id,
          status: "in_progress",
        },
        { onConflict: "user_id,challenge_id" } as any,
      )
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// ---------- Surprise Session ----------
//
// Rolls a REAL session: a registered historical symbol / timeframe / day that
// actually has stored candles. It never writes a synthetic provider. When
// nothing is covered it returns the same actionable no-market-data payload the
// normal Replay flow uses.

export const createRandomReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { pickSurpriseSession } = await import("./replay/surprise.server");
    const result = await pickSurpriseSession(context.supabase);

    if ("failure" in result) {
      return { session: null, unavailable: result.failure };
    }

    const { pick } = result;
    const cursor = new Date(pick.from + 2 * 3600_000).toISOString();
    const { data: row, error } = await context.supabase
      .from("replay_sessions")
      .insert({
        user_id: context.userId,
        title: "🎲 Surprise Session",
        mode: "day",
        market: pick.market,
        symbol: pick.symbol,
        timeframe: pick.timeframe,
        replay_date: pick.replayDate,
        // Real, stored history — resolved through the canonical service.
        provider: "historical",
        canonical_symbol: pick.symbol,
        source_provider: pick.providerCode,
        requested_start: new Date(pick.from).toISOString(),
        requested_end: new Date(pick.to).toISOString(),
        cursor_ts: cursor,
        is_random: true,
        hide_future: true,
        initial_balance: 10000,
        last_opened_at: new Date().toISOString(),
        tags: ["random"],
      })
      .select()
      .single();
    if (error) throw error;
    return { session: row, unavailable: null };
  });


// ---------- Session Summary ----------

export const getReplaySessionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: session } = await context.supabase
      .from("replay_sessions").select("*").eq("id", data.session_id).single();
    const { data: trades } = await context.supabase
      .from("replay_trades").select("*")
      .eq("session_id", data.session_id).eq("status", "closed");
    const list = trades ?? [];
    const total = list.length;
    const wins = list.filter((t: any) => (t.pnl ?? 0) > 0).length;
    const grossWin = list.filter((t: any) => (t.pnl ?? 0) > 0).reduce((a, t: any) => a + Number(t.pnl), 0);
    const grossLoss = Math.abs(list.filter((t: any) => (t.pnl ?? 0) < 0).reduce((a, t: any) => a + Number(t.pnl), 0));
    const net = list.reduce((a, t: any) => a + Number(t.pnl ?? 0), 0);
    const rTotal = list.reduce((a, t: any) => a + Number(t.rr_realized ?? 0), 0);
    // running equity dd
    let running = 0, peak = 0, dd = 0;
    for (const t of list) {
      running += Number(t.pnl ?? 0);
      if (running > peak) peak = running;
      if (peak - running > dd) dd = peak - running;
    }
    const best = list.reduce((a, t: any) => (t.pnl > (a?.pnl ?? -Infinity) ? t : a), null as any);
    const worst = list.reduce((a, t: any) => (t.pnl < (a?.pnl ?? Infinity) ? t : a), null as any);
    return {
      session,
      totals: {
        trades: total,
        wins,
        losses: total - wins,
        win_rate: total ? (wins / total) * 100 : 0,
        net_profit: net,
        gross_win: grossWin,
        gross_loss: grossLoss,
        profit_factor: grossLoss > 0 ? grossWin / grossLoss : grossWin,
        r_total: rTotal,
        avg_rr: total ? rTotal / total : 0,
        max_drawdown: dd,
      },
      best,
      worst,
      trades: list,
    };
  });

// ---------- AI Review ----------

const ReviewSchema = z.object({
  overall_rating: z.number().int().min(0).max(100),
  entry_analysis: z.string(),
  exit_analysis: z.string(),
  missed_opportunities: z.string(),
  risk_analysis: z.string(),
  psychology: z.string(),
  consistency: z.string(),
  suggestions: z.string(),
});

export const generateReplayAiReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured on server.");

    const { data: session, error: sErr } = await context.supabase
      .from("replay_sessions").select("*").eq("id", data.session_id).single();
    if (sErr || !session) throw sErr ?? new Error("Session not found");
    if (session.user_id !== context.userId) throw new Error("Forbidden");

    const [{ data: trades }, { data: notes }, { data: score }] = await Promise.all([
      context.supabase.from("replay_trades").select("*")
        .eq("session_id", data.session_id).order("opened_at"),
      context.supabase.from("replay_notes").select("body,note_ts")
        .eq("session_id", data.session_id).order("note_ts"),
      context.supabase.from("replay_scores").select("*")
        .eq("session_id", data.session_id).maybeSingle(),
    ]);

    const compact = (trades ?? []).slice(0, 40).map((t: any) => ({
      dir: t.direction, entry: t.entry_price, exit: t.exit_price,
      sl: t.stop_loss, tp: t.take_profit,
      rr: t.rr_realized, pnl: t.pnl, status: t.status,
      opened: t.opened_at, closed: t.closed_at,
    }));

    const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: true });
    const model = gateway(DEFAULT_MODEL);
    const prompt = [
      `You are an elite trading coach reviewing a replay practice session.`,
      `Symbol: ${session.symbol} · Timeframe: ${session.timeframe} · Market: ${session.market}`,
      `Trades: ${JSON.stringify(compact)}`,
      `Notes: ${JSON.stringify((notes ?? []).slice(0, 10))}`,
      `Existing score: ${JSON.stringify(score ?? {})}`,
      `Return a structured review with a 0-100 rating and concise, actionable feedback for each area.`,
    ].join("\n\n");

    let review: z.infer<typeof ReviewSchema>;
    try {
      const result = await generateText({
        model,
        system: "You are a disciplined, tough-but-fair trading coach. Be specific and concise.",
        prompt,
        output: Output.object({ schema: ReviewSchema }),
      });
      review = result.output as z.infer<typeof ReviewSchema>;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        try { review = ReviewSchema.parse(JSON.parse((err as any).text ?? "{}")); }
        catch { throw err; }
      } else throw err;
    }

    const { data: row, error } = await context.supabase
      .from("replay_ai_reviews")
      .insert({
        session_id: data.session_id,
        user_id: context.userId,
        model: DEFAULT_MODEL,
        overall_rating: review.overall_rating,
        entry_analysis: review.entry_analysis,
        exit_analysis: review.exit_analysis,
        missed_opportunities: review.missed_opportunities,
        risk_analysis: review.risk_analysis,
        psychology: review.psychology,
        consistency: review.consistency,
        suggestions: review.suggestions,
        raw: review as any,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const getReplayAiReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("replay_ai_reviews")
      .select("*")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row;
  });

// Silence unused-import warning while keeping types available for callers.
export const _tf_seconds = TIMEFRAME_SECONDS;
