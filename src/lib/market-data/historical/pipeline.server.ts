/**
 * Historical Import Pipeline (server-only).
 *
 * States: queued → preparing → downloading → validating → aggregating →
 * saving → completed | failed | cancelled | paused.
 *
 * Backward-compatible with the original runImport() API.
 */

import { getHistoricalProvider } from "./providers.server";
import { resolveHistoricalProvider, nativeSymbolForProvider } from "./routing";

import type { HistoricalCandle, HistoricalTimeframe } from "./types";
import { AGGREGATE_FROM, HISTORICAL_TF_SECONDS } from "./types";
import { backwardWindow, stepMsFor, BACKFILL_EMPTY_LIMIT } from "./backfill";
import { edgePatch } from "./edges";

type Admin = Awaited<ReturnType<typeof loadAdmin>>;
async function loadAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

/** Import job phase — persisted in historical_import_jobs.phase. */
export type JobPhase =
  | "queued" | "preparing" | "downloading" | "validating"
  | "aggregating" | "saving" | "completed" | "failed"
  | "cancelled" | "paused";

/** Legacy status column still supports success/failed/running for BC. */
function statusForPhase(p: JobPhase): string {
  if (p === "completed") return "success";
  if (p === "failed") return "failed";
  if (p === "cancelled") return "cancelled";
  if (p === "paused") return "paused";
  return "running";
}

async function setPhase(
  admin: Admin, jobId: string, phase: JobPhase, progress?: number, extra: Record<string, unknown> = {},
) {
  const patch: Record<string, unknown> = { phase, status: statusForPhase(phase), ...extra };
  if (typeof progress === "number") patch.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (phase === "cancelled") patch.cancelled_at = new Date().toISOString();
  if (phase === "paused") patch.paused_at = new Date().toISOString();
  await admin.from("historical_import_jobs").update(patch as any).eq("id", jobId);
}

async function log(
  admin: Admin, jobId: string | null, symbol: string, sourceCode: string,
  level: "info" | "warn" | "error", message: string, metadata: Record<string, unknown> = {},
) {
  await admin.from("historical_sync_logs").insert({
    job_id: jobId, symbol, source_code: sourceCode, level, message, metadata: metadata as any,
  } as any);
}

async function notify(
  admin: Admin, kind: string, severity: "info" | "warn" | "error", title: string,
  message?: string, metadata: Record<string, unknown> = {},
) {
  await admin.from("historical_notifications").insert({
    kind, severity, title, message, metadata: metadata as any,
  } as any);
}

async function isCancelled(admin: Admin, jobId: string): Promise<boolean> {
  const { data } = await admin
    .from("historical_import_jobs").select("phase, cancelled_at").eq("id", jobId).maybeSingle();
  return Boolean(data?.cancelled_at) || data?.phase === "cancelled";
}

/** Reject bad candles: NaN, non-positive prices, OHLC inconsistency, future ts, outliers. */
function validate(
  candles: HistoricalCandle[],
  timeframe: HistoricalTimeframe,
): { clean: HistoricalCandle[]; warnings: number; issues: Record<string, number> } {
  const nowMs = Date.now() + 60_000; // allow 1min clock skew
  const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
  const seen = new Set<number>();
  const out: HistoricalCandle[] = [];
  const issues: Record<string, number> = {
    future_ts: 0, negative: 0, invalid_ohlc: 0, duplicate: 0, misaligned: 0, outlier: 0,
  };

  // simple outlier: >20x median close change
  const sortedCloses = candles.map((c) => c.close).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const median = sortedCloses[Math.floor(sortedCloses.length / 2)] ?? 1;

  for (const c of candles) {
    if (!Number.isFinite(c.ts) || c.ts <= 0) { issues.invalid_ohlc++; continue; }
    if (c.ts > nowMs) { issues.future_ts++; continue; }
    if (![c.open, c.high, c.low, c.close].every((x) => Number.isFinite(x) && x > 0)) { issues.negative++; continue; }
    if (c.high < c.low) { issues.invalid_ohlc++; continue; }
    if (c.high < Math.max(c.open, c.close)) { issues.invalid_ohlc++; continue; }
    if (c.low > Math.min(c.open, c.close)) { issues.invalid_ohlc++; continue; }
    if (seen.has(c.ts)) { issues.duplicate++; continue; }
    if (c.ts % stepMs !== 0) issues.misaligned++; // warn only
    if (median > 0 && (c.close > median * 20 || c.close < median / 20)) { issues.outlier++; continue; }
    seen.add(c.ts);
    out.push(c);
  }
  out.sort((a, b) => a.ts - b.ts);
  const warnings = Object.values(issues).reduce((a, b) => a + b, 0);
  return { clean: out, warnings, issues };
}

export function aggregate(
  candles: HistoricalCandle[],
  targetTf: HistoricalTimeframe,
): HistoricalCandle[] {
  const stepMs = HISTORICAL_TF_SECONDS[targetTf] * 1000;
  const buckets = new Map<number, HistoricalCandle>();
  for (const c of candles) {
    const bucketTs = Math.floor(c.ts / stepMs) * stepMs;
    const cur = buckets.get(bucketTs);
    if (!cur) {
      buckets.set(bucketTs, { ts: bucketTs, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
}

function detectGaps(
  candles: HistoricalCandle[], timeframe: HistoricalTimeframe,
): { from: number; to: number; missing: number }[] {
  const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
  const gaps: { from: number; to: number; missing: number }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].ts - candles[i - 1].ts;
    if (diff > stepMs * 2) {
      const missing = Math.floor(diff / stepMs) - 1;
      gaps.push({ from: candles[i - 1].ts + stepMs, to: candles[i].ts - stepMs, missing });
    }
  }
  return gaps;
}

async function upsertCandles(
  admin: Admin, symbol: string, timeframe: HistoricalTimeframe,
  sourceCode: string, candles: HistoricalCandle[],
  onProgress?: (p: number) => Promise<void> | void,
): Promise<{ inserted: number; skipped: number }> {
  if (candles.length === 0) return { inserted: 0, skipped: 0 };
  const rows = candles.map((c) => ({
    symbol, timeframe, provider_code: sourceCode,
    ts: new Date(c.ts).toISOString(),
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error, count } = await admin
      .from("historical_candles")
      .upsert(slice as any, { onConflict: "symbol,timeframe,provider_code,ts", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;
    inserted += count ?? 0;
    if (onProgress) await onProgress(Math.round(((i + slice.length) / rows.length) * 100));
  }
  return { inserted, skipped: candles.length - inserted };
}

/** Create replay snapshots every ~N candles for instant jump-to-date. */
async function writeSnapshots(
  admin: Admin, symbol: string, timeframe: HistoricalTimeframe, candles: HistoricalCandle[],
) {
  if (candles.length < 100) return 0;
  const stride =
    timeframe === "1m" ? 1440 :        // 1 day
    timeframe === "5m" ? 288 :
    timeframe === "15m" ? 96 :
    timeframe === "30m" ? 48 :
    timeframe === "1H" ? 24 :
    timeframe === "4H" ? 30 :
    timeframe === "1D" ? 30 :
    timeframe === "1W" ? 13 : 12;
  const rows: any[] = [];
  for (let i = 0; i < candles.length; i += stride) {
    const c = candles[i];
    rows.push({
      symbol, timeframe, ts: new Date(c.ts).toISOString(),
      candle_index: i, price: c.close,
    });
  }
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("historical_snapshots")
      .upsert(rows.slice(i, i + 500) as any, { onConflict: "symbol,timeframe,ts", ignoreDuplicates: true });
  }
  return rows.length;
}

export type RunImportOpts = {
  symbol: string;
  nativeSymbol: string;
  /** Requested provider. Overridden when it isn't canonical for the market. */
  sourceCode: string;
  /** Market kind; looked up from historical_symbols when omitted. */
  market?: string | null;
  timeframe: HistoricalTimeframe;
  from: number;
  to: number;
  triggeredBy?: string;
  aggregateHigherTfs?: boolean;
  priority?: number;
  maxRetries?: number;
  existingJobId?: string; // for retries
};

export async function runImport(rawOpts: RunImportOpts) {
  const admin = await loadAdmin();

  // ---- Canonical provider resolution (single source of truth) ----
  let market = rawOpts.market ?? null;
  let storedNative: string | null = rawOpts.nativeSymbol ?? null;
  let storedProvider: string | null = rawOpts.sourceCode ?? null;
  if (!market) {
    const { data: row } = await admin
      .from("historical_symbols")
      .select("market, native_symbol, source_code")
      .eq("symbol", rawOpts.symbol).maybeSingle();
    market = (row?.market as string) ?? null;
    storedNative = (row?.native_symbol as string) ?? storedNative;
    storedProvider = (row?.source_code as string) ?? storedProvider;
  }
  const resolution = resolveHistoricalProvider(market, rawOpts.sourceCode || storedProvider);
  const nativeSymbol = nativeSymbolForProvider(
    resolution.code, rawOpts.symbol, storedNative, storedProvider,
  );
  const opts: RunImportOpts = {
    ...rawOpts, sourceCode: resolution.code, nativeSymbol, market,
  };

  const provider = getHistoricalProvider(opts.sourceCode);
  const started = Date.now();


  // Create or reuse job row
  let jobId: string;
  if (opts.existingJobId) {
    jobId = opts.existingJobId;
    await admin.from("historical_import_jobs").update({
      status: "running", phase: "preparing", progress: 0,
      started_at: new Date().toISOString(), finished_at: null,
      error_message: null, cancelled_at: null, paused_at: null,
    } as any).eq("id", jobId);
  } else {
    const { data: jobRow, error: jobErr } = await admin
      .from("historical_import_jobs")
      .insert({
        symbol: opts.symbol, source_code: opts.sourceCode, timeframe: opts.timeframe,
        range_from: new Date(opts.from).toISOString(), range_to: new Date(opts.to).toISOString(),
        status: "running", phase: "preparing", triggered_by: opts.triggeredBy ?? "manual",
        priority: opts.priority ?? 100,
        max_retries: opts.maxRetries ?? 3,
        started_at: new Date().toISOString(),
      } as any)
      .select().single();
    if (jobErr || !jobRow) throw jobErr ?? new Error("Failed to create import job");
    jobId = jobRow.id as string;
  }

  try {
    await log(admin, jobId, opts.symbol, opts.sourceCode, "info", "Import started",
      { from: opts.from, to: opts.to, timeframe: opts.timeframe,
        market, nativeSymbol: opts.nativeSymbol,
        requestedProvider: rawOpts.sourceCode, resolvedProvider: resolution.code,
        routingReason: resolution.reason });
    if (resolution.overrode) {
      await log(admin, jobId, opts.symbol, opts.sourceCode, "warn",
        `Provider re-routed: ${resolution.reason}`, { requested: rawOpts.sourceCode, used: resolution.code });
    }

    if (await isCancelled(admin, jobId)) return { jobId, cancelled: true };

    // Downloading
    await setPhase(admin, jobId, "downloading", 5);
    const fetchStart = Date.now();
    const rawCandles = await provider.fetchCandles({
      nativeSymbol: opts.nativeSymbol,
      timeframe: opts.timeframe,
      from: opts.from,
      to: opts.to,
    });
    const providerMs = Date.now() - fetchStart;
    await admin.from("historical_import_jobs").update({ provider_response_ms: providerMs } as any).eq("id", jobId);

    // Never report success with zero candles — that hides provider failures.
    if (!rawCandles.length) {
      throw new Error(
        `[${opts.sourceCode}] returned 0 candles for ${opts.symbol} (${opts.nativeSymbol}) ` +
        `${opts.timeframe} ${new Date(opts.from).toISOString()} → ${new Date(opts.to).toISOString()}. ` +
        `Check the symbol mapping or the provider's coverage for this range.`,
      );
    }

    if (await isCancelled(admin, jobId)) return { jobId, cancelled: true };

    // Validating
    await setPhase(admin, jobId, "validating", 35);
    const { clean, warnings, issues } = validate(rawCandles, opts.timeframe);
    if (warnings > 0) {
      await log(admin, jobId, opts.symbol, opts.sourceCode, "warn",
        `Validation flagged ${warnings} candles`, issues);
    }


    // Saving
    await setPhase(admin, jobId, "saving", 55);
    const { inserted, skipped } = await upsertCandles(
      admin, opts.symbol, opts.timeframe, opts.sourceCode, clean,
      async (p) => setPhase(admin, jobId, "saving", 55 + Math.round(p * 0.15)),
    );
    const gaps = detectGaps(clean, opts.timeframe);
    if (gaps.length) {
      await admin.from("historical_gaps").insert(
        gaps.map((g) => ({
          symbol: opts.symbol, timeframe: opts.timeframe,
          gap_from: new Date(g.from).toISOString(),
          gap_to: new Date(g.to).toISOString(),
          missing_candles: g.missing,
        })),
      );
      if (gaps.reduce((a, b) => a + b.missing, 0) > 500) {
        await notify(admin, "large_gap", "warn",
          `${opts.symbol} · ${opts.timeframe}: large gap detected`,
          `${gaps.length} gap(s), ${gaps.reduce((a, b) => a + b.missing, 0)} candles missing.`,
          { symbol: opts.symbol, timeframe: opts.timeframe, gaps: gaps.length });
      }
    }

    // Aggregating
    let aggInserted = 0;
    if (opts.aggregateHigherTfs && (opts.timeframe === "1m" || opts.timeframe === "1D")) {
      await setPhase(admin, jobId, "aggregating", 80);
      const higher: HistoricalTimeframe[] = opts.timeframe === "1m"
        ? ["5m", "15m", "30m", "1H", "4H", "1D"]
        : ["1W", "1M"];
      for (const tf of higher) {
        if (AGGREGATE_FROM[tf] !== opts.timeframe) continue;
        const agg = aggregate(clean, tf);
        const r = await upsertCandles(admin, opts.symbol, tf, opts.sourceCode, agg);
        aggInserted += r.inserted;
      }
    }

    // Snapshots for replay
    const snaps = await writeSnapshots(admin, opts.symbol, opts.timeframe, clean);

    // Update symbol coverage.
    //
    // Both columns are monotonic and in OPPOSITE directions, and which way
    // each may move is not the same question as which way this import ran —
    // see `./edges` (HD-3). `latest_imported` used to be written
    // unconditionally here, which meant a backward walk stamped an old front
    // edge onto a current symbol and starved the forward slice that sorts on
    // it.
    if (clean.length > 0) {
      const { data: sym } = await admin
        .from("historical_symbols")
        .select("id, earliest_available, latest_imported")
        .eq("symbol", opts.symbol).maybeSingle();
      if (sym) {
        const patch = edgePatch(
          {
            earliestAvailable: sym.earliest_available
              ? new Date(sym.earliest_available).getTime() : null,
            latestImported: sym.latest_imported
              ? new Date(sym.latest_imported).getTime() : null,
          },
          // `clean` is sorted ascending by `validate`, so these are the bounds.
          { firstTs: clean[0].ts, lastTs: clean[clean.length - 1].ts },
        );
        // Empty when the import landed inside what was already recorded —
        // skip the write rather than issue an update that changes nothing.
        if (Object.keys(patch).length > 0) {
          await admin.from("historical_symbols").update(patch as any).eq("id", sym.id);
        }
      }
    }

    const durationMs = Date.now() - started;
    await admin.from("historical_import_jobs").update({
      phase: "completed", status: "success", progress: 100,
      candles_fetched: rawCandles.length,
      candles_inserted: inserted + aggInserted,
      candles_skipped: skipped,
      gaps_detected: gaps.length,
      warning_count: warnings,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    } as any).eq("id", jobId);

    await log(admin, jobId, opts.symbol, opts.sourceCode, "info",
      `Completed: +${inserted} base, +${aggInserted} agg, ${snaps} snapshots, ${gaps.length} gaps in ${durationMs}ms`);

    return { jobId, fetched: rawCandles.length, inserted, aggregated: aggInserted, skipped, gaps: gaps.length, snapshots: snaps, warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Retry logic
    const { data: jobRow } = await admin
      .from("historical_import_jobs")
      .select("retry_count, max_retries").eq("id", jobId).maybeSingle();
    const retryCount = (jobRow?.retry_count ?? 0) as number;
    const maxRetries = (jobRow?.max_retries ?? 3) as number;
    if (retryCount < maxRetries) {
      await admin.from("historical_import_jobs").update({
        retry_count: retryCount + 1,
        phase: "queued", status: "running",
        error_message: `Retry ${retryCount + 1}/${maxRetries}: ${msg}`,
      } as any).eq("id", jobId);
      await log(admin, jobId, opts.symbol, opts.sourceCode, "warn",
        `Retrying (${retryCount + 1}/${maxRetries}): ${msg}`);
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retryCount)));
      return runImport({ ...opts, existingJobId: jobId });
    }
    await admin.from("historical_import_jobs").update({
      status: "failed", phase: "failed",
      error_message: msg, finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    } as any).eq("id", jobId);
    await log(admin, jobId, opts.symbol, opts.sourceCode, "error", msg);
    await notify(admin, "import_failed", "error",
      `Import failed: ${opts.symbol} · ${opts.timeframe}`, msg, { jobId, symbol: opts.symbol });
    throw e;
  }
}

export async function runIncrementalUpdate(symbolRow: {
  id: string; symbol: string; native_symbol: string; source_code: string; base_timeframe: string;
}) {
  const admin = await loadAdmin();
  const tf = (symbolRow.base_timeframe || "1m") as HistoricalTimeframe;
  const { data: last } = await admin
    .from("historical_candles")
    .select("ts")
    .eq("symbol", symbolRow.symbol).eq("timeframe", tf)
    .order("ts", { ascending: false }).limit(1).maybeSingle();
  const stepMs = HISTORICAL_TF_SECONDS[tf] * 1000;
  /**
   * Seed window for a symbol with NO stored bars.
   *
   * This was 30 days, and every symbol's `base_timeframe` is `1m`, so a first
   * sync asked for 30 x 24 x 60 = 43,200 bars — 44 sequential Binance pages,
   * or nine Twelve Data pages against an 8 credit/min budget, then 43,200 rows
   * to upsert. In one HTTP request. That exceeds the platform's execution
   * limit long before it exceeds any timeout we set, so first sync could never
   * complete and the symbol stayed empty for ever.
   *
   * Two days is 2,880 bars at 1m: three Binance pages, one Twelve Data page.
   * A first sync is now the same size as an ordinary incremental one.
   *
   * NOTE this bounds how far back a FIRST sync reaches, and subsequent runs
   * only ever walk forward from `latest_imported`. So history accumulates from
   * the seed onward and never extends backwards — deeper history needs its own
   * backward-walking pass. See HD-1.
   */
  const SEED_DAYS = 2;
  const from = last?.ts ? new Date(last.ts).getTime() + stepMs : Date.now() - SEED_DAYS * 86400_000;
  const to = Date.now();
  if (to - from < stepMs) return { skipped: true };
  return runImport({
    symbol: symbolRow.symbol,
    nativeSymbol: symbolRow.native_symbol,
    sourceCode: symbolRow.source_code,
    timeframe: tf,
    from, to,
    triggeredBy: "cron",
    aggregateHigherTfs: true,
  });
}

/**
 * HD-1 · extend a symbol's history BACKWARD by one step.
 *
 * Counterpart to `runIncrementalUpdate`, and deliberately the same shape: read
 * the edge from the DATA, ask for one bounded slice, stop. The window
 * arithmetic lives in `./backfill` where it is pure and tested; everything
 * here is the database and provider plumbing around it.
 *
 * Both edges come from `historical_candles`, never from
 * `historical_symbols.earliest_available` / `latest_imported`. The forward
 * walk already works that way, and for the backward walk it also sidesteps
 * MD-4: the chart's cache-through writes candles without touching those
 * columns, so a trader opening an old chart moves the real back edge while the
 * column does not follow.
 *
 * Exhaustion is recorded in `metadata`, which is already `jsonb` on that
 * table — no migration. Without it, a symbol whose provider has no more
 * history would re-request the same empty range every run, for ever, out of a
 * budget with no room to waste.
 */
export async function runBackwardUpdate(symbolRow: {
  id: string; symbol: string; native_symbol: string; source_code: string;
  base_timeframe: string; metadata?: Record<string, unknown> | null;
}) {
  const admin = await loadAdmin();
  const tf = (symbolRow.base_timeframe || "1m") as HistoricalTimeframe;

  const [{ data: first }, { data: last }] = await Promise.all([
    admin.from("historical_candles").select("ts")
      .eq("symbol", symbolRow.symbol).eq("timeframe", tf)
      .order("ts", { ascending: true }).limit(1).maybeSingle(),
    admin.from("historical_candles").select("ts")
      .eq("symbol", symbolRow.symbol).eq("timeframe", tf)
      .order("ts", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const meta = (symbolRow.metadata ?? {}) as Record<string, unknown>;
  const attemptedFrom =
    typeof meta.backfill_attempted_from === "number" ? meta.backfill_attempted_from : null;
  const emptyStreak =
    typeof meta.backfill_empty_streak === "number" ? meta.backfill_empty_streak : 0;

  const window = backwardWindow({
    earliestTs: first?.ts ? new Date(first.ts).getTime() : null,
    latestTs: last?.ts ? new Date(last.ts).getTime() : null,
    stepMs: stepMsFor(tf),
    attemptedFrom,
    exhausted: Boolean(meta.backfill_exhausted_at),
  });

  if ("skip" in window) return { skipped: true, reason: window.skip };

  const result = await runImport({
    symbol: symbolRow.symbol,
    nativeSymbol: symbolRow.native_symbol,
    sourceCode: symbolRow.source_code,
    timeframe: tf,
    from: window.from,
    to: window.to,
    // Distinguishable from the forward walk in `historical_import_jobs`, which
    // is where GBP/USD's two 429s were found. A backward run that starts
    // failing must be attributable without reading timestamps.
    triggeredBy: "cron:backfill",
    // The forward walk aggregates; a backward one would re-derive higher
    // timeframes over a window it has only partially filled.
    aggregateHigherTfs: false,
  });

  // Nothing came back. That is NOT sufficient evidence of exhaustion.
  //
  // A US-hours instrument returns nothing whenever a 2-day window lands clear
  // of a session — Saturday 13:29 to Monday 13:29 holds no NYSE trading at
  // all, and the market opens one minute later. Marking on the first empty
  // step made an ordinary weekend permanently fatal to every equity and ETF
  // in the catalog. Forex is immune only because Twelve Data serves it 24/7
  // (MD-5), which is why this stayed invisible.
  //
  // So an empty step advances the cursor and increments a streak; only
  // BACKFILL_EMPTY_LIMIT consecutive empties mean the provider has genuinely
  // run out. Writing `backfill_attempted_from` is the half that matters most:
  // without it the next run recomputes the identical window, because
  // `earliestTs` derives from stored data that an empty step did not change.
  if (!result?.inserted) {
    const streak = emptyStreak + 1;
    const done = streak >= BACKFILL_EMPTY_LIMIT;
    const patch: Record<string, unknown> = {
      ...meta,
      backfill_attempted_from: window.from,
      backfill_empty_streak: streak,
    };
    if (done) patch.backfill_exhausted_at = new Date().toISOString();
    const { error } = await admin
      .from("historical_symbols").update({ metadata: patch } as never).eq("id", symbolRow.id);
    // supabase-js returns { error }, it does not throw (MD-8). An unread
    // result here would silently stall the cursor and loop the same window.
    if (error) throw error;
    return { ...result, empty: true, emptyStreak: streak, exhausted: done };
  }

  // A real step. Move the cursor with it and clear the streak, so a closure
  // encountered earlier costs nothing once the walk is past it.
  const { error: cursorError } = await admin
    .from("historical_symbols")
    .update({
      metadata: { ...meta, backfill_attempted_from: window.from, backfill_empty_streak: 0 },
    } as never)
    .eq("id", symbolRow.id);
  if (cursorError) throw cursorError;

  return result;
}
