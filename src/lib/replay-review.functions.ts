/**
 * Phase 8D · Replay review, history, comparison and improvement server layer.
 *
 * Thin wrappers only. Every derivation lives in `./replay/review/*`, and every
 * read is owner-scoped by RLS through the authenticated middleware client.
 *
 * Scoring runs HERE, from canonical `chart_closed_trades` rows, so a score is
 * reproducible from server truth rather than from whatever the tab happened to
 * hold in memory.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReplayScore } from "./replay/score";
import { buildScoreInputs, SCORE_VERSION } from "./replay/review/score";
import { buildHistory, buildSessionReview, loadReflectionCounts, loadSessionTrades } from "./replay/review/derive.server";

export const getReplayReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => buildSessionReview(context.supabase, data.session_id));

export const listReplayHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
        status: z.string().nullable().optional(),
        symbol: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) =>
    buildHistory(context.supabase, {
      limit: Math.min(200, Math.max(1, data.limit ?? 50)),
      offset: Math.max(0, data.offset ?? 0),
      status: data.status ?? null,
      symbol: data.symbol ?? null,
      search: data.search ?? null,
    }),
  );

/**
 * Score a session from server truth.
 *
 * Reproducible by construction: identical rows + identical `SCORE_VERSION`
 * produce an identical `input_revision` and an identical score.
 */
export const scoreReplaySessionCanonical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid(), complete: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = data.session_id;

    const [{ data: session }, trades, counts, bookmarksRes] = await Promise.all([
      context.supabase.from("replay_sessions").select("initial_balance").eq("id", id).maybeSingle(),
      loadSessionTrades(context.supabase, id),
      loadReflectionCounts(context.supabase, id),
      context.supabase.from("replay_bookmarks").select("category").eq("session_id", id),
    ]);

    const bookmarks = (bookmarksRes.data ?? []) as { category: string }[];
    const categories = new Set(bookmarks.map((b) => b.category));
    const balance = session?.initial_balance != null ? Number(session.initial_balance) : null;

    const inputs = buildScoreInputs({
      trades,
      startingBalance: balance,
      checklistTotal: counts.checklistTotal,
      checklistDone: counts.checklistDone,
      bookmarkCategories: categories.size,
      notesCount: counts.notes,
    });

    const breakdown = computeReplayScore({
      trades: inputs.trades as never,
      checklist: Array.from({ length: counts.checklistTotal }, (_, i) => ({
        checked: i < counts.checklistDone,
      })) as never,
      bookmarks: bookmarks as never,
      notesCount: counts.notes,
    });

    const { data: score, error } = await context.supabase
      .from("replay_scores")
      .insert({
        session_id: id,
        user_id: context.userId,
        score: breakdown.score,
        discipline: breakdown.discipline,
        risk: breakdown.risk,
        execution: breakdown.execution,
        patience: breakdown.patience,
        consistency: breakdown.consistency,
        journal_completion: breakdown.journal_completion,
        score_version: SCORE_VERSION,
        input_source: "canonical",
        input_revision: inputs.revision,
        unknown_inputs: inputs.unknowns,
        breakdown: { notes: breakdown.notes, tradeCount: trades.length, source: "canonical" },
      } as never)
      .select()
      .single();
    if (error) throw error;

    if (data.complete !== false) {
      await context.supabase
        .from("replay_sessions")
        .update({ status: "completed", completion_pct: 100 } as never)
        .eq("id", id);
    }

    return { score, breakdown, inputs: { version: inputs.version, revision: inputs.revision, unknowns: inputs.unknowns } };
  });

/** Link a completed session to the original trade it was practising. */
export const linkReplayOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        session_id: z.string().uuid(),
        original_entry_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("replay_sessions")
      .update({ source_journal_id: data.original_entry_id } as never)
      .eq("id", data.session_id);
    if (error) throw error;
    return { ok: true };
  });

/** Persist one Original-vs-Replay comparison attempt (idempotent per attempt). */
export const saveReplayComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        session_id: z.string().uuid(),
        original_entry_id: z.string().uuid().nullable().optional(),
        mode: z.string().optional(),
        attempt_number: z.number().int().optional(),
        intent: z.record(z.string(), z.unknown()).optional(),
        reflection: z.record(z.string(), z.unknown()).optional(),
        telemetry: z.record(z.string(), z.unknown()).optional(),
        breakdown: z.record(z.string(), z.unknown()).optional(),
        process_delta: z.number().nullable().optional(),
        outcome_delta: z.number().nullable().optional(),
        verdict: z.string().nullable().optional(),
        status: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("replay_comparisons")
      .select("id, attempt_number")
      .eq("session_id", data.session_id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      session_id: data.session_id,
      user_id: context.userId,
      original_entry_id: data.original_entry_id ?? null,
      mode: data.mode ?? "standard",
      attempt_number: data.attempt_number ?? existing?.attempt_number ?? 1,
      intent: data.intent ?? {},
      reflection: data.reflection ?? {},
      telemetry: data.telemetry ?? {},
      breakdown: data.breakdown ?? {},
      process_delta: data.process_delta ?? null,
      outcome_delta: data.outcome_delta ?? null,
      verdict: data.verdict ?? null,
      status: data.status ?? "completed",
      completed_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { data: updated, error } = await context.supabase
        .from("replay_comparisons").update(row as never).eq("id", existing.id).select().single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("replay_comparisons").insert(row as never).select().single();
    if (error) throw error;
    return inserted;
  });

/** Record a screenshot after the browser uploaded the image to storage. */
export const registerReplayScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        session_id: z.string().uuid(),
        storage_path: z.string(),
        caption: z.string().nullable().optional(),
        captured_ts: z.string(),
        cursor_ts: z.string().nullable().optional(),
        dataset_checksum: z.string().nullable().optional(),
        symbol: z.string().nullable().optional(),
        timeframe: z.string().nullable().optional(),
        trade_id: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_screenshots")
      .insert({
        session_id: data.session_id,
        user_id: context.userId,
        storage_path: data.storage_path,
        caption: data.caption ?? null,
        captured_ts: data.captured_ts,
        cursor_ts: data.cursor_ts ?? null,
        dataset_checksum: data.dataset_checksum ?? null,
        symbol: data.symbol ?? null,
        timeframe: data.timeframe ?? null,
        trade_id: data.trade_id ?? null,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/** Turn a review finding into a concrete practice drill. */
export const createReplayHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_session_id: z.string().uuid(),
        symbol: z.string(),
        market: z.string(),
        timeframe: z.string(),
        difficulty: z.string().optional(),
        target_r: z.number().optional(),
        max_trades: z.number().int().optional(),
        reason: z.string().nullable().optional(),
        focus: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_homework")
      .insert({
        user_id: context.userId,
        source_session_id: data.source_session_id,
        symbol: data.symbol,
        market: data.market,
        timeframe: data.timeframe,
        difficulty: data.difficulty ?? "standard",
        target_r: data.target_r ?? 1,
        max_trades: data.max_trades ?? 3,
        reason: data.reason ?? null,
        mistake_focus: data.focus ?? null,
        status: "suggested",
      } as never)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/** Improvement Intelligence feed: scores over time + every attempt delta. */
export const getReplayImprovement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const limit = Math.min(200, Math.max(5, data.limit ?? 50));
    const [scores, comparisons, homework, sessions] = await Promise.all([
      context.supabase
        .from("replay_scores")
        .select("id, session_id, score, discipline, risk, execution, patience, consistency, journal_completion, score_version, created_at")
        .order("created_at", { ascending: false }).limit(limit),
      context.supabase
        .from("replay_comparisons")
        .select("id, session_id, attempt_number, mode, process_delta, outcome_delta, verdict, status, reflection, created_at")
        .order("created_at", { ascending: false }).limit(limit),
      context.supabase
        .from("replay_homework")
        .select("id, symbol, timeframe, status, reason, mistake_focus, target_r, max_trades, created_at")
        .order("created_at", { ascending: false }).limit(limit),
      context.supabase
        .from("replay_sessions")
        .select("id, title, symbol, timeframe, status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(limit),
    ]);

    return {
      scores: scores.data ?? [],
      comparisons: comparisons.data ?? [],
      homework: homework.data ?? [],
      sessions: sessions.data ?? [],
    };
  });
