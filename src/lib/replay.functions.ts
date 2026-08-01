import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { TIMEFRAME_SECONDS, DEFAULT_TEMPLATES, CHECKPOINT_KINDS } from "./replay/constants";
import { coverageStatusFor, serializeGaps } from "./replay/provenance";
import type { Timeframe } from "./replay/types";

/* ============ Checkpoints ============ */

export const listReplayCheckpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("replay_checkpoints")
      .select("*")
      .eq("session_id", data.session_id)
      .order("checkpoint_ts");
    if (error) throw error;
    return rows ?? [];
  });

export const createReplayCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      session_id: z.string().uuid(),
      label: z.string().trim().min(1).max(80).default("Checkpoint"),
      checkpoint_ts: z.string(),
      kind: z.enum(CHECKPOINT_KINDS).default("custom"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_checkpoints")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReplayCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_checkpoints").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Templates ============ */

export const listReplayTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("replay_templates")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    // Seed defaults for first-time users
    if (!data || data.filter((t) => t.user_id === context.userId).length === 0) {
      const seed = DEFAULT_TEMPLATES.map((t) => ({
        user_id: context.userId,
        name: t.name,
        market: t.market,
        symbol: t.symbol,
        timeframe: t.timeframe,
        mode: t.mode,
        playback_speed: t.playback_speed,
        difficulty: t.difficulty,
        favorite_session: t.favorite_session,
        objectives: t.objectives,
      }));
      await context.supabase.from("replay_templates").insert(seed);
      const { data: refreshed } = await context.supabase
        .from("replay_templates")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      return refreshed ?? [];
    }
    return data;
  });

export const saveReplayTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      market: z.string(),
      symbol: z.string(),
      timeframe: z.string(),
      mode: z.string(),
      playback_speed: z.number().default(1),
      difficulty: z.string().optional().nullable(),
      favorite_session: z.string().optional().nullable(),
      objectives: z.array(z.string()).default([]),
      settings: z.record(z.string(), z.any()).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_templates")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReplayTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_templates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Reset progress (Replay Again) ============ */

export const resetReplayProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await Promise.all([
      context.supabase.from("replay_trades").delete().eq("session_id", data.session_id),
      context.supabase.from("replay_scores").delete().eq("session_id", data.session_id),
    ]);
    await context.supabase
      .from("replay_sessions")
      .update({ cursor_ts: null, completion_pct: 0, status: "active", duration_seconds: 0 })
      .eq("id", data.session_id);
    await context.supabase.from("replay_events").insert({
      session_id: data.session_id,
      user_id: context.userId,
      event_type: "session_reset",
      event_ts: new Date().toISOString(),
      payload: {},
    });
    return { ok: true };
  });


/* ============ Sessions ============ */

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Untitled Replay"),
  mode: z.enum(["trade", "session", "free", "day", "range"]).default("free"),
  market: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.enum(["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"]).default("5m"),
  replay_date: z.string().optional().nullable(),
  range_start: z.string().optional().nullable(),
  range_end: z.string().optional().nullable(),
  source_trade_id: z.string().uuid().optional().nullable(),
  source_journal_id: z.string().uuid().optional().nullable(),
  provider: z.string().default("historical"),
  tags: z.array(z.string()).default([]),
  initial_balance: z.number().positive().optional(),
});

export const createReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const cursor = data.replay_date
      ? new Date(`${data.replay_date}T09:30:00Z`).toISOString()
      : data.range_start ?? new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("replay_sessions")
      .insert({
        user_id: context.userId,
        title: data.title,
        mode: data.mode,
        market: data.market,
        symbol: data.symbol,
        timeframe: data.timeframe,
        replay_date: data.replay_date ?? null,
        range_start: data.range_start ?? null,
        range_end: data.range_end ?? null,
        source_trade_id: data.source_trade_id ?? null,
        source_journal_id: data.source_journal_id ?? null,
        provider: data.provider,
        tags: data.tags,
        cursor_ts: cursor,
        last_opened_at: new Date().toISOString(),
        ...(data.initial_balance ? { initial_balance: data.initial_balance } : {}),
      })
      .select()
      .single();
    if (error) throw error;

    // Seed default checklist
    const { DEFAULT_CHECKLIST } = await import("./replay/constants");
    await context.supabase.from("replay_checklists").insert(
      DEFAULT_CHECKLIST.map((label, i) => ({
        session_id: row.id,
        user_id: context.userId,
        label,
        sort_order: i,
      })),
    );

    await context.supabase.from("replay_events").insert({
      session_id: row.id,
      user_id: context.userId,
      event_type: "session_created",
      event_ts: new Date().toISOString(),
      payload: { mode: data.mode, symbol: data.symbol, timeframe: data.timeframe },
    });

    return row;
  });

export const listReplaySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("replay_sessions")
      .select("*")
      .is("deleted_at", null)
      .order("last_opened_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const getReplaySession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [session, trades, notes, bookmarks, checklist, scores, drawings, screenshots, events] =
      await Promise.all([
        context.supabase.from("replay_sessions").select("*").eq("id", data.id).single(),
        context.supabase.from("replay_trades").select("*").eq("session_id", data.id).order("opened_at"),
        context.supabase.from("replay_notes").select("*").eq("session_id", data.id).order("note_ts"),
        context.supabase.from("replay_bookmarks").select("*").eq("session_id", data.id).order("bookmark_ts"),
        context.supabase.from("replay_checklists").select("*").eq("session_id", data.id).order("sort_order"),
        context.supabase.from("replay_scores").select("*").eq("session_id", data.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        context.supabase.from("replay_drawings").select("*").eq("session_id", data.id),
        context.supabase.from("replay_screenshots").select("*").eq("session_id", data.id).order("captured_ts", { ascending: false }),
        context.supabase.from("replay_events").select("*").eq("session_id", data.id).order("event_ts").limit(500),
      ]);
    if (session.error) throw session.error;
    // Touch last_opened_at
    await context.supabase
      .from("replay_sessions")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", data.id);
    return {
      session: session.data,
      trades: trades.data ?? [],
      notes: notes.data ?? [],
      bookmarks: bookmarks.data ?? [],
      checklist: checklist.data ?? [],
      score: scores.data ?? null,
      drawings: drawings.data ?? [],
      screenshots: screenshots.data ?? [],
      events: events.data ?? [],
    };
  });

export const updateReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      cursor_ts: z.string().optional(),
      playback_speed: z.number().optional(),
      completion_pct: z.number().optional(),
      duration_seconds: z.number().int().optional(),
      status: z.enum(["active", "paused", "completed", "archived"]).optional(),
      is_favorite: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      settings: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("replay_sessions")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("replay_sessions")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Trades ============ */

export const createReplayTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      session_id: z.string().uuid(),
      symbol: z.string(),
      market: z.string(),
      direction: z.enum(["long", "short"]),
      order_type: z.enum(["market", "limit", "stop"]).default("market"),
      entry_price: z.number(),
      stop_loss: z.number().optional().nullable(),
      take_profit: z.number().optional().nullable(),
      lot_size: z.number(),
      risk_pct: z.number().optional().nullable(),
      rr_planned: z.number().optional().nullable(),
      opened_at: z.string(),
      notes: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_trades")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("replay_events").insert({
      session_id: data.session_id,
      user_id: context.userId,
      event_type: "trade_opened",
      event_ts: data.opened_at,
      payload: { trade_id: row.id, direction: data.direction, entry: data.entry_price },
    });
    return row;
  });

export const closeReplayTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      exit_price: z.number(),
      closed_at: z.string(),
      pnl: z.number(),
      rr_realized: z.number().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_trades")
      .update({
        exit_price: data.exit_price,
        closed_at: data.closed_at,
        pnl: data.pnl,
        rr_realized: data.rr_realized ?? null,
        status: "closed",
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("replay_events").insert({
      session_id: row.session_id,
      user_id: context.userId,
      event_type: "trade_closed",
      event_ts: data.closed_at,
      payload: { trade_id: data.id, pnl: data.pnl },
    });
    return row;
  });

export const deleteReplayTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_trades").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Modify an open replay trade's SL / TP / lot size. Used by Break-Even,
 * Trailing Stop, and Partial Close flows so we don't have to close+reopen
 * for a simple stop nudge.
 */
export const updateReplayTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      stop_loss: z.number().nullable().optional(),
      take_profit: z.number().nullable().optional(),
      lot_size: z.number().positive().optional(),
      notes: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("replay_trades")
      .update(patch)
      .eq("id", id)
      .eq("status", "open")
      .select()
      .maybeSingle();
    if (error) throw error;
    // Trade was closed (or removed) between the drag start and the save —
    // treat as a no-op instead of surfacing a fatal error to the UI.
    if (!row) return null;
    await context.supabase.from("replay_events").insert({
      session_id: row.session_id,
      user_id: context.userId,
      event_type: "trade_modified",
      event_ts: new Date().toISOString(),
      payload: { trade_id: id, ...patch },
    });
    return row;
  });


export const listReplayTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("replay_trades")
      .select("*, replay_sessions!inner(title, symbol, market)")
      .order("opened_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

/* ============ Notes / Bookmarks / Checklist ============ */

export const createReplayNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      session_id: z.string().uuid(),
      note_ts: z.string(),
      body: z.string().default(""),
      screenshot_path: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_notes")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReplayNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_notes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const createReplayBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      session_id: z.string().uuid(),
      bookmark_ts: z.string(),
      label: z.string().default("Bookmark"),
      category: z.enum(["good_setup", "bad_setup", "mistake", "lesson", "question", "custom"]).default("custom"),
      color: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_bookmarks")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReplayBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_bookmarks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), checked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("replay_checklists")
      .update({ checked: data.checked })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const addChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ session_id: z.string().uuid(), label: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_checklists")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/* ============ Screenshots ============ */

export const createScreenshotRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      session_id: z.string().uuid(),
      storage_path: z.string(),
      captured_ts: z.string(),
      caption: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("replay_screenshots")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/* ============ Score + finish ============ */

/* Legacy `finishReplaySession` (scored `replay_trades`) was removed in
   Phase 8C. Canonical sessions are scored by `scoreReplaySession` in
   `replay-reflection.functions.ts`, which runs the same single
   `computeReplayScore` formula against canonical ClosedTrade facts. */

export const getReplayStatistics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("replay_statistics")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

/* ============ Candles (canonical historical service) ============
 *
 * Replay reads REAL market history only. The old behaviour — silently
 * falling back to the synthetic generator whenever `historical_candles`
 * had no rows — has been removed: it meant traders could practise on
 * fabricated price action believing it was real.
 *
 * The service validates session-aware coverage, backfills on demand from
 * the registered provider, and otherwise returns a structured
 * `unavailable` payload the UI renders as an actionable error state.
 * Demo sessions must opt in explicitly via `allowSynthetic`.
 * ================================================================== */

export const getReplayCandles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string(),
      timeframe: z.enum(["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"]),
      from: z.number(),
      to: z.number(),
      market: z.string().optional(),
      /** When given, resolved provenance is frozen onto the session row. */
      session_id: z.string().uuid().optional(),
      /** Only honoured for sessions explicitly created as demos. */
      allowSynthetic: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resolveHistoricalRange, HistoricalDataUnavailableError } =
      await import("./market-data/historical/service.server");
    const stepSec = TIMEFRAME_SECONDS[data.timeframe as Timeframe];

    try {
      const res = await resolveHistoricalRange(context.supabase, {
        symbol: data.symbol,
        // 3m has no stored equivalent; the service normalises the rest.
        timeframe: (data.timeframe === "3m" ? "5m" : data.timeframe) as any,
        from: data.from,
        to: data.to,
        market: data.market,
        allowBackfill: true,
        allowSynthetic: data.allowSynthetic === true,
      });
      const provenance = {
        source_provider: res.source.providerCode,
        source_type: res.source.kind,
        imported_at: res.symbolMeta.importedAt,
        requested_start: new Date(data.from).toISOString(),
        requested_end: new Date(data.to).toISOString(),
        actual_start: res.coverage.firstTs ? new Date(res.coverage.firstTs).toISOString() : null,
        actual_end: res.coverage.lastTs ? new Date(res.coverage.lastTs).toISOString() : null,
        candle_count: res.coverage.actual,
        expected_candle_count: res.coverage.expected,
        coverage_status: coverageStatusFor({
          ok: res.coverage.ok,
          gaps: res.coverage.gaps.length,
          isSynthetic: res.source.isSynthetic,
          actual: res.coverage.actual,
        }),
        known_gaps: serializeGaps(res.coverage.gaps),
        canonical_symbol: res.symbolMeta.canonicalSymbol,
        exchange: res.symbolMeta.exchange,
        timezone: res.symbolMeta.timezone,
        adjustment_mode: res.symbolMeta.adjustmentMode,
        data_version: res.symbolMeta.dataVersion,
        provenance_recorded_at: new Date().toISOString(),
      };

      if (data.session_id) {
        // Freeze provenance the first time a dataset resolves; refresh it when
        // an earlier attempt recorded an unavailable dataset.
        const { data: existing } = await context.supabase
          .from("replay_sessions")
          .select("provenance_recorded_at, coverage_status")
          .eq("id", data.session_id)
          .maybeSingle();
        const frozen = !!existing?.provenance_recorded_at && existing.coverage_status !== "unavailable";
        if (!frozen) {
          await context.supabase
            .from("replay_sessions")
            .update(provenance)
            .eq("id", data.session_id);
        }
      }

      return {
        candles: res.candles,
        provenance,
        providerId: res.source.providerCode,
        providerLabel: res.source.label,
        sourceKind: res.source.kind,
        isSynthetic: res.source.isSynthetic,
        coverage: {
          actual: res.coverage.actual,
          expected: res.coverage.expected,
          ratio: res.coverage.ratio,
          gaps: res.coverage.gaps.length,
        },
        warning: res.warning ?? null,
        unavailable: null,
        stepSec,
      };
    } catch (e) {
      if (e instanceof HistoricalDataUnavailableError) {
        if (data.session_id) {
          await context.supabase
            .from("replay_sessions")
            .update({
              coverage_status: "unavailable",
              requested_start: new Date(data.from).toISOString(),
              requested_end: new Date(data.to).toISOString(),
              candle_count: e.detail.coverage.actual,
              expected_candle_count: e.detail.coverage.expected,
              known_gaps: serializeGaps(e.detail.coverage.gaps),
              provenance_recorded_at: new Date().toISOString(),
            })
            .eq("id", data.session_id);
        }
        return {
          candles: [],
          provenance: null,
          providerId: null,
          providerLabel: null,
          sourceKind: null,
          isSynthetic: false,
          coverage: {
            actual: e.detail.coverage.actual,
            expected: e.detail.coverage.expected,
            ratio: e.detail.coverage.ratio,
            gaps: e.detail.coverage.gaps.length,
          },
          warning: null,
          unavailable: {
            message: e.message,
            remedy: e.detail.remedy,
            registered: e.detail.registered,
            attemptedBackfill: e.detail.attemptedBackfill,
            providerError: e.detail.providerError ?? null,
          },
          stepSec,
        };
      }
      throw e;
    }
  });


/* ============ Replay from an existing trade =========================
 *
 * "Replay this trade" — one-click entry from any surface that lists paper
 * trades (Dashboard, Journal, Analytics, Trade details). Looks up the
 * paper trade, computes a sensible timeframe/date window (approximately
 * 20-30 candles of context before entry), and creates a fresh Replay
 * Session anchored to the trade so users skip the wizard entirely.
 * ================================================================== */

const MARKET_ALLOWED = new Set(["forex", "crypto", "stocks", "indices", "futures", "metals"]);

function pickTimeframeForDuration(sec: number): Timeframe {
  if (!sec || sec <= 0) return "5m";
  if (sec <= 30 * 60) return "1m";        // ≤ 30 min → 1m candles
  if (sec <= 2 * 3600) return "5m";       // ≤ 2h    → 5m
  if (sec <= 8 * 3600) return "15m";      // ≤ 8h    → 15m
  if (sec <= 3 * 86400) return "1H";      // ≤ 3d    → 1H
  return "4H";
}

export const createReplayFromTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      trade_id: z.string().uuid(),
      timeframe: z.enum(["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: trade, error: tErr } = await context.supabase
      .from("paper_trades")
      .select("id, symbol, market, direction, opened_at, closed_at")
      .eq("id", data.trade_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!trade) throw new Error("Trade not found");

    const openedMs = new Date(trade.opened_at).getTime();
    const closedMs = trade.closed_at ? new Date(trade.closed_at).getTime() : openedMs + 4 * 3600 * 1000;
    const durationSec = Math.max(60, Math.round((closedMs - openedMs) / 1000));
    const tf = (data.timeframe ?? pickTimeframeForDuration(durationSec)) as Timeframe;
    const stepSec = TIMEFRAME_SECONDS[tf];

    // ~25 candles of context before entry, and continue past exit by the
    // same margin so the trader can review the aftermath.
    const contextSec = stepSec * 25;
    const fromMs = openedMs - contextSec * 1000;
    const toMs = closedMs + contextSec * 1000;
    const rangeStart = new Date(fromMs).toISOString();
    const rangeEnd = new Date(toMs).toISOString();

    const market = MARKET_ALLOWED.has(trade.market) ? trade.market : "forex";
    const title = `Replay · ${trade.symbol} · ${new Date(openedMs).toISOString().slice(0, 10)}`;

    const { data: row, error } = await context.supabase
      .from("replay_sessions")
      .insert({
        user_id: context.userId,
        title,
        mode: "range",
        market,
        symbol: trade.symbol,
        timeframe: tf,
        replay_date: null,
        range_start: rangeStart,
        range_end: rangeEnd,
        source_trade_id: trade.id,
        source_journal_id: null,
        // Real history; Replay resolves it through the historical service.
        provider: "historical",
        tags: ["from-trade"],
        cursor_ts: rangeStart,
        last_opened_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Seed default checklist so the workspace behaves identically to a fresh session.
    const { DEFAULT_CHECKLIST } = await import("./replay/constants");
    await context.supabase.from("replay_checklists").insert(
      DEFAULT_CHECKLIST.map((label, i) => ({
        session_id: row.id,
        user_id: context.userId,
        label,
        sort_order: i,
      })),
    );

    await context.supabase.from("replay_events").insert({
      session_id: row.id,
      user_id: context.userId,
      event_type: "session_created",
      event_ts: new Date().toISOString(),
      payload: { source: "trade", trade_id: trade.id, symbol: trade.symbol, timeframe: tf },
    });

    return row;
  });
