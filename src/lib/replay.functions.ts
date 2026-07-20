import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReplayScore } from "./replay/score";
import { getProvider } from "./replay/market-data";
import { TIMEFRAME_SECONDS } from "./replay/constants";
import type { Timeframe } from "./replay/types";

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
  provider: z.string().default("synthetic"),
  tags: z.array(z.string()).default([]),
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

export const finishReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [trades, checklist, bookmarks, notes] = await Promise.all([
      context.supabase.from("replay_trades").select("*").eq("session_id", data.id),
      context.supabase.from("replay_checklists").select("*").eq("session_id", data.id),
      context.supabase.from("replay_bookmarks").select("*").eq("session_id", data.id),
      context.supabase.from("replay_notes").select("id, body").eq("session_id", data.id),
    ]);
    const breakdown = computeReplayScore({
      trades: (trades.data ?? []) as any,
      checklist: (checklist.data ?? []) as any,
      bookmarks: (bookmarks.data ?? []) as any,
      notesCount: (notes.data ?? []).length,
    });
    const { data: score, error } = await context.supabase
      .from("replay_scores")
      .insert({
        session_id: data.id,
        user_id: context.userId,
        score: breakdown.score,
        discipline: breakdown.discipline,
        risk: breakdown.risk,
        execution: breakdown.execution,
        patience: breakdown.patience,
        consistency: breakdown.consistency,
        journal_completion: breakdown.journal_completion,
        breakdown: { notes: breakdown.notes },
      })
      .select()
      .single();
    if (error) throw error;

    await context.supabase
      .from("replay_sessions")
      .update({ status: "completed", completion_pct: 100 })
      .eq("id", data.id);

    // Update aggregate statistics
    const { data: allSessions } = await context.supabase
      .from("replay_sessions")
      .select("id, market, symbol, duration_seconds")
      .eq("user_id", context.userId)
      .is("deleted_at", null);
    const { data: allScores } = await context.supabase
      .from("replay_scores")
      .select("score")
      .eq("user_id", context.userId);
    const { data: allTrades } = await context.supabase
      .from("replay_trades")
      .select("id")
      .eq("user_id", context.userId);

    const totalSessions = allSessions?.length ?? 0;
    const totalHours = (allSessions ?? []).reduce((s, x) => s + (x.duration_seconds ?? 0), 0) / 3600;
    const totalTrades = allTrades?.length ?? 0;
    const avgScore = allScores?.length
      ? Math.round(allScores.reduce((s, x) => s + (x.score ?? 0), 0) / allScores.length)
      : 0;
    const marketCounts = new Map<string, number>();
    const symbolCounts = new Map<string, number>();
    for (const s of allSessions ?? []) {
      marketCounts.set(s.market, (marketCounts.get(s.market) ?? 0) + 1);
      symbolCounts.set(s.symbol, (symbolCounts.get(s.symbol) ?? 0) + 1);
    }
    const topMarket = [...marketCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topSymbol = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    await context.supabase.from("replay_statistics").upsert({
      user_id: context.userId,
      total_sessions: totalSessions,
      total_hours: totalHours,
      total_trades: totalTrades,
      average_score: avgScore,
      most_practiced_market: topMarket,
      most_practiced_symbol: topSymbol,
      last_practiced_at: new Date().toISOString(),
    });

    return { score, breakdown };
  });

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

/* ============ Candles (server-side provider fetch) ============ */

export const getReplayCandles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string(),
      timeframe: z.enum(["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"]),
      from: z.number(),
      to: z.number(),
      provider: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1) Prefer stored historical candles (independent of any third-party API).
    const { data: rows } = await context.supabase
      .from("historical_candles")
      .select("ts, open, high, low, close, volume")
      .eq("symbol", data.symbol)
      .eq("timeframe", data.timeframe)
      .gte("ts", new Date(data.from).toISOString())
      .lte("ts", new Date(data.to).toISOString())
      .order("ts", { ascending: true })
      .limit(5000);
    if (rows && rows.length > 0) {
      const candles = rows.map((r: any) => ({
        time: new Date(r.ts as string).getTime(),
        open: Number(r.open), high: Number(r.high),
        low: Number(r.low), close: Number(r.close),
        volume: Number(r.volume ?? 0),
      }));
      return { candles, providerId: "historical", providerLabel: "Historical Data Engine",
        stepSec: TIMEFRAME_SECONDS[data.timeframe as Timeframe] };
    }
    // 2) Fallback: legacy synthetic provider.
    const provider = getProvider(data.provider);
    const candles = await provider.getCandles({
      symbol: data.symbol,
      timeframe: data.timeframe as Timeframe,
      from: data.from,
      to: data.to,
    });
    return { candles, providerId: provider.id, providerLabel: provider.label, stepSec: TIMEFRAME_SECONDS[data.timeframe as Timeframe] };
  });
