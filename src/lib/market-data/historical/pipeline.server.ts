/**
 * Historical Import Pipeline (server-only).
 *
 * States: queued → preparing → downloading → validating → aggregating →
 * saving → completed | failed | cancelled | paused.
 *
 * Backward-compatible with the original runImport() API.
 */

import { getHistoricalProvider } from "./providers.server";
import type { HistoricalCandle, HistoricalTimeframe } from "./types";
import { AGGREGATE_FROM, HISTORICAL_TF_SECONDS } from "./types";

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
  sourceCode: string;
  timeframe: HistoricalTimeframe;
  from: number;
  to: number;
  triggeredBy?: string;
  aggregateHigherTfs?: boolean;
  priority?: number;
  maxRetries?: number;
  existingJobId?: string; // for retries
};

export async function runImport(opts: RunImportOpts) {
  const admin = await loadAdmin();
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
      { from: opts.from, to: opts.to, timeframe: opts.timeframe });

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
        await admin.from("historical_symbols").update(patch as any).eq("id", sym.id);
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
