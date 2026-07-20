import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------- Public reads (auth required) ---------- */

export const listHistoricalSymbols = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_symbols")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const listHistoricalSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_data_sources")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const listHistoricalJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_import_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const getHistoricalHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: symbolsCount }, { count: jobsCount }, { count: gapsCount }, { count: candlesCount }] = await Promise.all([
      context.supabase.from("historical_symbols").select("id", { count: "exact", head: true }),
      context.supabase.from("historical_import_jobs").select("id", { count: "exact", head: true }),
      context.supabase.from("historical_gaps").select("id", { count: "exact", head: true }).eq("status", "open"),
      context.supabase.from("historical_candles").select("ts", { count: "estimated", head: true }),
    ]);
    const { data: recent } = await context.supabase
      .from("historical_import_jobs")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(50);
    const okRate = recent && recent.length
      ? (recent.filter((r) => r.status === "success").length / recent.length) * 100
      : 100;
    return {
      symbols: symbolsCount ?? 0,
      jobs: jobsCount ?? 0,
      openGaps: gapsCount ?? 0,
      candles: candlesCount ?? 0,
      successRate: Math.round(okRate),
    };
  });

/* ---------- Candles readback (used by Replay & backtests) ---------- */

const candleQuerySchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.enum(["1m","5m","15m","30m","1H","4H","1D","1W","1M"]),
  from: z.number().int(),
  to: z.number().int(),
  limit: z.number().int().min(1).max(10000).default(5000),
});

export const getHistoricalCandles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => candleQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("historical_candles")
      .select("ts, open, high, low, close, volume")
      .eq("symbol", data.symbol)
      .eq("timeframe", data.timeframe)
      .gte("ts", new Date(data.from).toISOString())
      .lte("ts", new Date(data.to).toISOString())
      .order("ts", { ascending: true })
      .limit(data.limit);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      time: new Date(r.ts as string).getTime(),
      open: Number(r.open), high: Number(r.high),
      low: Number(r.low),   close: Number(r.close),
      volume: Number(r.volume ?? 0),
    }));
  });

/* ---------- Admin mutations ---------- */

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

const importSchema = z.object({
  symbolId: z.string().uuid(),
  timeframe: z.enum(["1m","5m","15m","30m","1H","4H","1D","1W","1M"]).default("1D"),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  aggregate: z.boolean().default(true),
});

export const runHistoricalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: sym, error } = await context.supabase
      .from("historical_symbols").select("*").eq("id", data.symbolId).maybeSingle();
    if (error) throw error;
    if (!sym) throw new Error("Symbol not found");
    const { runImport } = await import("./historical/pipeline.server");
    const to = data.to ?? Date.now();
    const from = data.from ?? to - 90 * 86400_000; // default: last 90 days
    return runImport({
      symbol: sym.symbol,
      nativeSymbol: sym.native_symbol,
      sourceCode: sym.source_code,
      timeframe: data.timeframe,
      from, to,
      triggeredBy: "admin",
      aggregateHigherTfs: data.aggregate,
    });
  });

export const toggleHistoricalSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("historical_symbols").update({ is_enabled: data.is_enabled }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const addSymbolSchema = z.object({
  source_code: z.string(),
  market: z.string(),
  symbol: z.string(),
  native_symbol: z.string(),
  display_name: z.string().optional(),
});

export const addHistoricalSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addSymbolSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("historical_symbols")
      .insert({ ...data, display_name: data.display_name ?? data.symbol })
      .select().single();
    if (error) throw error;
    return row;
  });

export const runIncrementalSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: sym, error } = await context.supabase
      .from("historical_symbols").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!sym) throw new Error("Symbol not found");
    const { runIncrementalUpdate } = await import("./historical/pipeline.server");
    return runIncrementalUpdate(sym as any);
  });
