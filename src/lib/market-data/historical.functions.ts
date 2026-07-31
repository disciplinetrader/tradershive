import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TF = z.enum(["1m","5m","15m","30m","1H","4H","1D","1W","1M"]);
type Tf = z.infer<typeof TF>;

/* ---------- Reads (auth required) ---------- */

export const listHistoricalSymbols = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_symbols").select("*")
      .order("priority", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const listHistoricalSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_data_sources").select("*")
      .order("priority", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const listHistoricalJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_import_jobs").select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

/** Live queue snapshot: active + queued jobs, plus counts. */
export const getImportQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: active } = await context.supabase
      .from("historical_import_jobs")
      .select("id,symbol,timeframe,source_code,phase,status,progress,retry_count,priority,candles_fetched,candles_inserted,started_at,created_at,duration_ms,provider_response_ms")
      .in("phase", ["queued","preparing","downloading","validating","aggregating","saving","paused"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    const { count: completedToday } = await context.supabase
      .from("historical_import_jobs").select("id", { count: "exact", head: true })
      .eq("status","success")
      .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
    const { count: failedToday } = await context.supabase
      .from("historical_import_jobs").select("id", { count: "exact", head: true })
      .eq("status","failed")
      .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
    return {
      active: active ?? [],
      completedToday: completedToday ?? 0,
      failedToday: failedToday ?? 0,
    };
  });

/** Coverage matrix: rows per symbol × timeframe. */
export const getCoverageMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_coverage").select("*")
      .order("symbol", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getHistoricalHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [
      { count: symbolsCount },
      { count: jobsCount },
      { count: gapsCount },
      { count: candlesCount },
      { count: dupCount },
    ] = await Promise.all([
      context.supabase.from("historical_symbols").select("id", { count: "exact", head: true }),
      context.supabase.from("historical_import_jobs").select("id", { count: "exact", head: true }),
      context.supabase.from("historical_gaps").select("id", { count: "exact", head: true }).eq("status", "open"),
      context.supabase.from("historical_candles").select("ts", { count: "estimated", head: true }),
      context.supabase.from("historical_sync_logs").select("id", { count: "estimated", head: true }).eq("level","warn"),
    ]);
    const { data: recent } = await context.supabase
      .from("historical_import_jobs").select("status,provider_response_ms,duration_ms")
      .order("created_at", { ascending: false }).limit(50);
    const rate = recent && recent.length
      ? (recent.filter((r) => r.status === "success").length / recent.length) * 100
      : 100;
    const avgProviderMs = recent && recent.length
      ? recent.filter((r)=>r.provider_response_ms)
          .reduce((a,b)=>a + Number(b.provider_response_ms||0), 0) / Math.max(1, recent.filter((r)=>r.provider_response_ms).length)
      : 0;
    const { data: lastOk } = await context.supabase
      .from("historical_import_jobs").select("finished_at").eq("status","success")
      .order("finished_at", { ascending: false }).limit(1).maybeSingle();
    const healthScore = Math.max(0, Math.min(100, Math.round(rate - (gapsCount ?? 0) / 10)));
    return {
      symbols: symbolsCount ?? 0,
      jobs: jobsCount ?? 0,
      openGaps: gapsCount ?? 0,
      candles: candlesCount ?? 0,
      warnings: dupCount ?? 0,
      successRate: Math.round(rate),
      avgProviderMs: Math.round(avgProviderMs),
      lastSuccessfulSync: lastOk?.finished_at ?? null,
      healthScore,
    };
  });

/* ---------- Candles readback ---------- */

const candleQuerySchema = z.object({
  symbol: z.string().min(1),
  timeframe: TF,
  from: z.number().int(),
  to: z.number().int(),
  limit: z.number().int().min(1).max(10000).default(5000),
});

/**
 * Read-only coverage probe. Used before a backtest is created so the user
 * learns up-front that a range has no real data, instead of opening a
 * session that cannot load.
 */
export const probeHistoricalCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(1),
      timeframe: TF,
      from: z.number().int(),
      to: z.number().int(),
      market: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { probeCoverage } = await import("./historical/service.server");
    const r = await probeCoverage(context.supabase, {
      symbol: data.symbol,
      timeframe: data.timeframe as any,
      from: data.from,
      to: data.to,
      market: data.market,
    });
    return {
      ok: r.coverage.ok,
      registered: r.registered,
      enabled: r.enabled,
      sourceCode: r.sourceCode,
      message: r.message,
      actual: r.coverage.actual,
      expected: r.coverage.expected,
      ratio: r.coverage.ratio,
    };
  });

/**
 * Canonical resolve-with-backfill entry point shared by Replay, the
 * backtest wizard and any future chart consumer. Returns a structured
 * `unavailable` payload rather than substituting data.
 */
export const ensureHistoricalRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(1),
      timeframe: TF,
      from: z.number().int(),
      to: z.number().int(),
      market: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resolveHistoricalRange, HistoricalDataUnavailableError } =
      await import("./historical/service.server");
    try {
      const r = await resolveHistoricalRange(context.supabase, {
        symbol: data.symbol,
        timeframe: data.timeframe as any,
        from: data.from,
        to: data.to,
        market: data.market,
        allowBackfill: true,
      });
      return {
        ok: true as const,
        count: r.candles.length,
        source: r.source,
        ratio: r.coverage.ratio,
        warning: r.warning ?? null,
        unavailable: null,
      };
    } catch (e) {
      if (e instanceof HistoricalDataUnavailableError) {
        return {
          ok: false as const,
          count: 0,
          source: null,
          ratio: e.detail.coverage.ratio,
          warning: null,
          unavailable: { message: e.message, remedy: e.detail.remedy },
        };
      }
      throw e;
    }
  });



export const getHistoricalCandles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => candleQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("historical_candles")
      .select("ts, open, high, low, close, volume")
      .eq("symbol", data.symbol).eq("timeframe", data.timeframe)
      .gte("ts", new Date(data.from).toISOString())
      .lte("ts", new Date(data.to).toISOString())
      .order("ts", { ascending: true }).limit(data.limit);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      time: new Date(r.ts as string).getTime(),
      open: Number(r.open), high: Number(r.high),
      low: Number(r.low), close: Number(r.close),
      volume: Number(r.volume ?? 0),
    }));
  });

/** Jump-to-date replay snapshot lookup. */
export const findReplaySnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ symbol: z.string(), timeframe: TF, target: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("historical_snapshots")
      .select("ts,candle_index,price")
      .eq("symbol", data.symbol).eq("timeframe", data.timeframe)
      .lte("ts", new Date(data.target).toISOString())
      .order("ts", { ascending: false }).limit(1).maybeSingle();
    return row ?? null;
  });

/* ---------- Admin mutations ---------- */

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

const importSchema = z.object({
  symbolId: z.string().uuid(),
  timeframe: TF.default("1D"),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  aggregate: z.boolean().default(true),
  priority: z.number().int().min(1).max(999).default(100),
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
    const from = data.from ?? to - 90 * 86400_000;
    return runImport({
      symbol: sym.symbol, nativeSymbol: sym.native_symbol, sourceCode: sym.source_code,
      timeframe: data.timeframe, from, to,
      triggeredBy: "admin", aggregateHigherTfs: data.aggregate, priority: data.priority,
    });
  });

/** Bulk import — enqueue N symbols matching a filter. Runs sequentially to respect rate limits. */
const bulkSchema = z.object({
  market: z.string().optional(),
  sourceCode: z.string().optional(),
  timeframe: TF.default("1D"),
  days: z.number().int().min(1).max(3650).default(365),
  aggregate: z.boolean().default(true),
});

export const bulkHistoricalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("historical_symbols").select("*").eq("is_enabled", true);
    if (data.market) q = q.eq("market", data.market);
    if (data.sourceCode) q = q.eq("source_code", data.sourceCode);
    const { data: syms, error } = await q.order("priority", { ascending: true });
    if (error) throw error;
    if (!syms?.length) return { enqueued: 0, ok: 0, failed: 0 };
    const { runImport } = await import("./historical/pipeline.server");
    const to = Date.now();
    const from = to - data.days * 86400_000;
    let okCount = 0;
    let failCount = 0;
    for (const sym of syms) {
      try {
        await runImport({
          symbol: sym.symbol, nativeSymbol: sym.native_symbol, sourceCode: sym.source_code,
          timeframe: data.timeframe, from, to,
          triggeredBy: `bulk:${data.market ?? "all"}`,
          aggregateHigherTfs: data.aggregate, priority: 200,
        });
        okCount++;
      } catch {
        failCount++;
      }
    }
    return { enqueued: syms.length, ok: okCount, failed: failCount };
  });

/** Enable / disable all symbols matching a filter. */
export const bulkToggleSymbols = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    market: z.string().optional(),
    sourceCode: z.string().optional(),
    enable: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("historical_symbols").update({ is_enabled: data.enable });
    if (data.market) q = q.eq("market", data.market);
    if (data.sourceCode) q = q.eq("source_code", data.sourceCode);
    if (!data.market && !data.sourceCode) q = q.gt("priority", -1); // affect all
    const { data: rows, error } = await q.select("id");
    if (error) throw error;
    return { affected: rows?.length ?? 0 };
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
  source_code: z.string(), market: z.string(),
  symbol: z.string(), native_symbol: z.string(),
  display_name: z.string().optional(),
  exchange: z.string().optional(),
  timezone: z.string().optional(),
  instrument_type: z.string().optional(),
  base_currency: z.string().optional(),
  quote_currency: z.string().optional(),
  tick_size: z.number().optional(),
  price_precision: z.number().int().optional(),
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

export const updateSymbolMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    patch: z.object({
      exchange: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
      tick_size: z.number().nullable().optional(),
      pip_value: z.number().nullable().optional(),
      price_precision: z.number().int().nullable().optional(),
      lot_size: z.number().nullable().optional(),
      base_currency: z.string().nullable().optional(),
      quote_currency: z.string().nullable().optional(),
      instrument_type: z.string().nullable().optional(),
      trading_hours: z.any().optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("historical_symbols")
      .update(data.patch as any).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
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

/* ---------- Queue controls ---------- */

const jobIdSchema = z.object({ jobId: z.string().uuid() });

export const cancelImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("historical_import_jobs")
      .update({
        phase: "cancelled", status: "cancelled",
        cancelled_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      }).eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });

export const pauseImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("historical_import_jobs")
      .update({ phase: "paused", status: "paused", paused_at: new Date().toISOString() })
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });

export const resumeImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: job, error } = await context.supabase.from("historical_import_jobs")
      .select("*").eq("id", data.jobId).maybeSingle();
    if (error) throw error;
    if (!job) throw new Error("Job not found");
    const { data: sym } = await context.supabase.from("historical_symbols")
      .select("native_symbol").eq("symbol", job.symbol).maybeSingle();
    if (!sym) throw new Error("Symbol not found");
    const { runImport } = await import("./historical/pipeline.server");
    return runImport({
      symbol: job.symbol, nativeSymbol: sym.native_symbol, sourceCode: job.source_code,
      timeframe: job.timeframe as Tf,
      from: new Date(job.range_from).getTime(),
      to: new Date(job.range_to).getTime(),
      triggeredBy: "resume", existingJobId: job.id, aggregateHigherTfs: true,
    });
  });

export const retryImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: job, error } = await context.supabase.from("historical_import_jobs")
      .select("*").eq("id", data.jobId).maybeSingle();
    if (error) throw error;
    if (!job) throw new Error("Job not found");
    const { data: sym } = await context.supabase.from("historical_symbols")
      .select("native_symbol").eq("symbol", job.symbol).maybeSingle();
    if (!sym) throw new Error("Symbol not found");
    // Reset retry counter to allow another N tries
    await context.supabase.from("historical_import_jobs").update({ retry_count: 0 }).eq("id", job.id);
    const { runImport } = await import("./historical/pipeline.server");
    return runImport({
      symbol: job.symbol, nativeSymbol: sym.native_symbol, sourceCode: job.source_code,
      timeframe: job.timeframe as Tf,
      from: new Date(job.range_from).getTime(),
      to: new Date(job.range_to).getTime(),
      triggeredBy: "retry", existingJobId: job.id, aggregateHigherTfs: true,
    });
  });

/* ---------- Sessions & notifications ---------- */

export const listTradingSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("historical_sessions").select("*")
      .eq("is_enabled", true).order("market").order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

export const listAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("historical_notifications").select("*")
      .order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("historical_notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });
