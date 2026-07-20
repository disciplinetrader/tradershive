/**
 * Historical Import Pipeline (server-only).
 *
 * Fetch → validate → dedupe → upsert → aggregate higher timeframes →
 * detect gaps → log. Requires supabaseAdmin (service role).
 */

import { getHistoricalProvider } from "./providers.server";
import type { HistoricalCandle, HistoricalTimeframe } from "./types";
import { AGGREGATE_FROM, HISTORICAL_TF_SECONDS } from "./types";

type Admin = Awaited<ReturnType<typeof loadAdmin>>;
async function loadAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

async function log(
  admin: Admin,
  jobId: string | null,
  symbol: string,
  sourceCode: string,
  level: "info" | "warn" | "error",
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await admin.from("historical_sync_logs").insert({
    job_id: jobId, symbol, source_code: sourceCode, level, message, metadata,
  });
}

/** Reject bad candles: NaN, non-positive prices, OHLC inconsistency. */
function validate(candles: HistoricalCandle[]): HistoricalCandle[] {
  const seen = new Set<number>();
  const out: HistoricalCandle[] = [];
  for (const c of candles) {
    if (!Number.isFinite(c.ts) || c.ts <= 0) continue;
    if (![c.open, c.high, c.low, c.close].every((x) => Number.isFinite(x) && x > 0)) continue;
    if (c.high < c.low) continue;
    if (c.high < Math.max(c.open, c.close)) continue;
    if (c.low > Math.min(c.open, c.close)) continue;
    if (seen.has(c.ts)) continue;
    seen.add(c.ts);
    out.push(c);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Aggregate lower TF candles to a higher TF. */
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

/** Detect internal gaps (missing consecutive base-tf candles). */
function detectGaps(
  candles: HistoricalCandle[],
  timeframe: HistoricalTimeframe,
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
  admin: Admin,
  symbol: string,
  timeframe: HistoricalTimeframe,
  sourceCode: string,
  candles: HistoricalCandle[],
): Promise<{ inserted: number; skipped: number }> {
  if (candles.length === 0) return { inserted: 0, skipped: 0 };
  const rows = candles.map((c) => ({
    symbol, timeframe, source_code: sourceCode,
    ts: new Date(c.ts).toISOString(),
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
  let inserted = 0;
  // Chunk to keep payloads small
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error, count } = await admin
      .from("historical_candles")
      .upsert(slice, { onConflict: "symbol,timeframe,ts", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;
    inserted += count ?? 0;
  }
  return { inserted, skipped: candles.length - inserted };
}

export type RunImportOpts = {
  symbol: string;             // canonical (e.g. BTC/USDT)
  nativeSymbol: string;       // provider native (e.g. BTCUSDT)
  sourceCode: string;         // binance | dukascopy
  timeframe: HistoricalTimeframe;
  from: number;
  to: number;
  triggeredBy?: string;
  aggregateHigherTfs?: boolean;
};

export async function runImport(opts: RunImportOpts) {
  const admin = await loadAdmin();
  const provider = getHistoricalProvider(opts.sourceCode);

  // Create job
  const { data: jobRow, error: jobErr } = await admin
    .from("historical_import_jobs")
    .insert({
      symbol: opts.symbol, source_code: opts.sourceCode, timeframe: opts.timeframe,
      range_from: new Date(opts.from).toISOString(), range_to: new Date(opts.to).toISOString(),
      status: "running", triggered_by: opts.triggeredBy ?? "manual",
      started_at: new Date().toISOString(),
    })
    .select().single();
  if (jobErr || !jobRow) throw jobErr ?? new Error("Failed to create import job");
  const jobId = jobRow.id as string;

  try {
    await log(admin, jobId, opts.symbol, opts.sourceCode, "info", "Import started",
      { from: opts.from, to: opts.to, timeframe: opts.timeframe });

    const rawCandles = await provider.fetchCandles({
      nativeSymbol: opts.nativeSymbol,
      timeframe: opts.timeframe,
      from: opts.from,
      to: opts.to,
    });
    const clean = validate(rawCandles);
    const { inserted, skipped } = await upsertCandles(
      admin, opts.symbol, opts.timeframe, opts.sourceCode, clean,
    );
    const gaps = detectGaps(clean, opts.timeframe);

    // Persist gaps
    if (gaps.length) {
      await admin.from("historical_gaps").insert(
        gaps.map((g) => ({
          symbol: opts.symbol, timeframe: opts.timeframe,
          gap_from: new Date(g.from).toISOString(),
          gap_to: new Date(g.to).toISOString(),
          missing_candles: g.missing,
        })),
      );
    }

    // Aggregate higher TFs from newly-imported base data
    let aggInserted = 0;
    if (opts.aggregateHigherTfs && (opts.timeframe === "1m" || opts.timeframe === "1D")) {
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

    // Update symbol coverage
    if (clean.length > 0) {
      const earliestIso = new Date(clean[0].ts).toISOString();
      const latestIso = new Date(clean[clean.length - 1].ts).toISOString();
      const { data: sym } = await admin
        .from("historical_symbols")
        .select("id, earliest_available, latest_imported")
        .eq("source_code", opts.sourceCode).eq("symbol", opts.symbol).maybeSingle();
      if (sym) {
        const patch: Record<string, string> = { latest_imported: latestIso };
        if (!sym.earliest_available || new Date(sym.earliest_available).getTime() > clean[0].ts) {
          patch.earliest_available = earliestIso;
        }
        await admin.from("historical_symbols").update(patch).eq("id", sym.id);
      }
    }

    await admin.from("historical_import_jobs").update({
      status: "success",
      candles_fetched: rawCandles.length,
      candles_inserted: inserted + aggInserted,
      candles_skipped: skipped,
      gaps_detected: gaps.length,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);

    await log(admin, jobId, opts.symbol, opts.sourceCode, "info",
      `Import completed: ${inserted} base + ${aggInserted} aggregated candles inserted (${gaps.length} gaps).`);

    return { jobId, fetched: rawCandles.length, inserted, aggregated: aggInserted, skipped, gaps: gaps.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("historical_import_jobs").update({
      status: "failed", error_message: msg, finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    await log(admin, jobId, opts.symbol, opts.sourceCode, "error", msg);
    throw e;
  }
}

/** Incremental update — download only new candles since the latest stored. */
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
  const from = last?.ts ? new Date(last.ts).getTime() + stepMs : Date.now() - 30 * 86400_000;
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
