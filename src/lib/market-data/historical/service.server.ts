/**
 * Canonical historical candle service (server-only).
 *
 * Every feature that needs historical OHLCV — Replay Studio, backtest
 * creation, journal chart snapshots — goes through `resolveHistoricalRange`.
 * One code path, one set of rules:
 *
 *   1. Read what is stored in `historical_candles`.
 *   2. Validate real, session-aware coverage of the requested range.
 *   3. If it's short and the symbol is registered, backfill on demand from
 *      the real provider, then re-validate.
 *   4. If it still isn't covered, FAIL LOUDLY with a structured error that
 *      tells the caller exactly what's missing and what to do about it.
 *
 * There is no silent substitution. Synthetic candles are only returned when
 * the caller explicitly opts in AND the server flag allows it, and they are
 * always tagged so the UI can badge them as demo data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCoverage, describeCoverage, type CoverageResult, type CoverageTimeframe } from "./coverage";
import { canonicalProviderCode, HistoricalProviderError } from "./providers.server";
import { resolveHistoricalProvider } from "./routing";


export type ServiceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DataSourceKind = "stored" | "backfilled" | "synthetic";

export type DataSource = {
  kind: DataSourceKind;
  /** Provider that actually produced the candles (e.g. binance, stooq). */
  providerCode: string;
  label: string;
  /** True when the data is fabricated and must be badged in the UI. */
  isSynthetic: boolean;
};

export type ResolveOptions = {
  symbol: string;
  timeframe: CoverageTimeframe;
  from: number;
  to: number;
  market?: string;
  /** Attempt an on-demand import when stored coverage is insufficient. */
  allowBackfill?: boolean;
  /** Explicit demo mode. Still requires ENABLE_SYNTHETIC_REPLAY. */
  allowSynthetic?: boolean;
  minRatio?: number;
};

export type SymbolProvenanceMeta = {
  canonicalSymbol: string;
  market: string;
  exchange: string | null;
  timezone: string | null;
  adjustmentMode: string;
  /** Last time the registered importer wrote candles for this symbol. */
  importedAt: string | null;
  dataVersion: string | null;
};

export type ResolveResult = {
  candles: ServiceCandle[];
  source: DataSource;
  coverage: CoverageResult;
  /** Everything needed to persist a complete provenance record. */
  symbolMeta: SymbolProvenanceMeta;
  /** Set when the range is usable but imperfect (gaps within tolerance). */
  warning?: string;
};

export class HistoricalDataUnavailableError extends Error {
  readonly code = "HISTORICAL_DATA_UNAVAILABLE";
  constructor(
    message: string,
    readonly detail: {
      symbol: string;
      timeframe: string;
      from: number;
      to: number;
      coverage: CoverageResult;
      /** What the operator/user can do next. */
      remedy: string;
      registered: boolean;
      attemptedBackfill: boolean;
      /**
       * The on-demand import's failure message, whatever caused it. Kept under
       * this name because callers already read it (`replay.functions.ts`);
       * `errorKind` says whether the provider was actually responsible.
       */
      providerError?: string;
      /** Who failed: the venue, or this deployment. See `isInfrastructureFailure`. */
      errorKind?: "provider" | "infrastructure";
    },
  ) {
    super(message);
    this.name = "HistoricalDataUnavailableError";
  }
}

type Db = SupabaseClient<any, any, any>;

/**
 * Upper bound on a single resolved range. Not a page size — a refusal
 * threshold. Exceeding it raises rather than truncating, because a short tape
 * that nobody is told about is the failure mode this whole function guards
 * against.
 */
const MAX_CANDLES = 50_000;

/**
 * Read every stored candle in a range, paging past the server's response cap.
 *
 * PostgREST caps responses server-side (1000 rows on this project), so a plain
 * `.limit(10000)` silently returned the first 1000 bars and nothing reported
 * it. Worse than the loud case: a range of 1,000–1,666 bars came back truncated
 * yet still passed `checkCoverage`, because 1000/1666 clears the 0.6 minimum —
 * so a replay session or battle would run on a tape ending early, with a
 * checksum computed over the truncated bars that matched perfectly. Written up
 * in docs/battle-replay.md, "Creating one", trap 3.
 *
 * The page size is MEASURED from the first response rather than assumed. The
 * cap is deployment configuration, so hardcoding 1000 here would reintroduce
 * the same bug anywhere it is set lower.
 *
 * Sorting is by `(ts, id)`, not `ts` alone: the live table is keyed
 * `UNIQUE(symbol, timeframe, provider_code, ts)`, so one symbol carrying two
 * providers has duplicate `ts` values, and offset paging over a non-total order
 * duplicates and skips rows. `id` is the primary key, which makes it total.
 */
async function readStored(
  db: Db,
  symbol: string,
  timeframe: string,
  from: number,
  to: number,
): Promise<{ candles: ServiceCandle[]; providerCode: string | null }> {
  const page = (withCount: boolean) =>
    db
      .from("historical_candles")
      .select(
        "ts, open, high, low, close, volume, provider_code",
        withCount ? { count: "exact" } : undefined,
      )
      .eq("symbol", symbol)
      .eq("timeframe", timeframe)
      .gte("ts", new Date(from).toISOString())
      .lte("ts", new Date(to).toISOString())
      .order("ts", { ascending: true })
      .order("id", { ascending: true });

  // The first response tells us both how many rows exist and how many the
  // server is willing to hand over at once.
  const first = await page(true).range(0, MAX_CANDLES - 1);
  if (first.error) throw first.error;

  const rows: any[] = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  const pageSize = rows.length;

  if (total > MAX_CANDLES) {
    throw new Error(
      `Historical range for ${symbol} · ${timeframe} holds ${total} candles, ` +
        `above the ${MAX_CANDLES} ceiling. Narrow the date range.`,
    );
  }

  while (pageSize > 0 && rows.length < total) {
    const next = await page(false).range(rows.length, rows.length + pageSize - 1);
    if (next.error) throw next.error;
    if (!next.data?.length) break; // no progress — stop rather than spin
    rows.push(...next.data);
  }

  // Paging is meant to make truncation impossible; assert it rather than trust
  // it, so any residual short read fails loudly instead of replaying short.
  if (rows.length !== total) {
    throw new Error(
      `Historical read for ${symbol} · ${timeframe} returned ${rows.length} of ` +
        `${total} rows. Refusing to continue on an incomplete series.`,
    );
  }

  return {
    candles: rows.map((r: any) => ({
      time: new Date(r.ts as string).getTime(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume ?? 0),
    })),
    providerCode: rows.length ? canonicalProviderCode(String(rows[0].provider_code ?? "")) : null,
  };
}

async function findSymbolRow(db: Db, symbol: string) {
  const { data } = await db
    .from("historical_symbols")
    .select("symbol, native_symbol, source_code, market, is_enabled, exchange, timezone, latest_imported, metadata, updated_at")
    .eq("symbol", symbol)
    .maybeSingle();
  return data ?? null;
}

/**
 * Failures that are OURS, not the venue's.
 *
 * The on-demand backfill catches everything `runImport` can throw and used to
 * report all of it as `The data provider (x) rejected the request`. That
 * sentence is false for a whole class of failure: a missing or invalid
 * `SUPABASE_SERVICE_ROLE_KEY` throws before a single byte is sent to the
 * provider, and the operator is then sent to investigate an exchange that was
 * never contacted (MD-11).
 *
 * Deliberately NARROW, and deliberately not a taxonomy. It matches only
 * signatures that cannot come from a market-data venue:
 *
 *   · the env-presence error raised by `createSupabaseAdminClient`;
 *   · a PostgREST/Postgres error object, identified by its `code` — `PGRST301`
 *     and friends, or a five-character SQLSTATE like `42501`;
 *   · auth/RLS phrasing that only PostgREST produces.
 *
 * Everything else stays a provider error, which is the safe default: calling a
 * genuine venue refusal "infrastructure" would send the operator to the wrong
 * place just as surely, in the direction this project has actually been burned
 * in before. A typed `HistoricalProviderError` short-circuits to `false` so no
 * future wording change to a provider message can be caught by the regex.
 */
const INFRA_MESSAGE =
  /missing supabase environment variable|invalid api ?key|no api key found|jwt (expired|is invalid|malformed)|permission denied|row-level security|violates row level security/i;

export function isInfrastructureFailure(e: unknown): boolean {
  if (e instanceof HistoricalProviderError) return false;

  if (e && typeof e === "object") {
    const code = (e as { code?: unknown }).code;
    // PostgREST codes (`PGRST301`) and bare SQLSTATEs (`42501`, `23505`).
    if (typeof code === "string" && (/^PGRST\d+$/.test(code) || /^[0-9A-Z]{5}$/.test(code))) {
      return true;
    }
  }

  const message = e instanceof Error ? e.message : String(e ?? "");
  return INFRA_MESSAGE.test(message);
}

/**
 * The remedy line for a failed on-demand import.
 *
 * Split out of `resolveHistoricalRange` so the classification is testable
 * without a database, a provider or a symbol row — the branch is the defect, so
 * the branch is what a test has to be able to reach.
 */
export function importFailureRemedy(routedCode: string, error: unknown, message: string): string {
  return isInfrastructureFailure(error)
    ? `The historical import could not run because of a server configuration or database error: ${message}. ` +
      `This is NOT a rejection by ${routedCode} — the provider may never have been contacted. ` +
      `Check the server logs and the Supabase service-role configuration.`
    : `The data provider (${routedCode}) rejected the request: ${message}`;
}

/**
 * Resolve a historical range. Never returns fabricated data unless the
 * caller explicitly asked for it and the server allows it.
 */
export async function resolveHistoricalRange(db: Db, opts: ResolveOptions): Promise<ResolveResult> {
  const { symbol, timeframe, from, to } = opts;
  const symbolRow = await findSymbolRow(db, symbol);
  const market = opts.market ?? symbolRow?.market ?? "forex";

  const symbolMeta: SymbolProvenanceMeta = {
    canonicalSymbol: symbolRow?.symbol ?? symbol,
    market,
    exchange: (symbolRow as any)?.exchange ?? null,
    timezone: (symbolRow as any)?.timezone ?? null,
    adjustmentMode: String((symbolRow as any)?.metadata?.adjustment_mode ?? "none"),
    importedAt: (symbolRow as any)?.latest_imported ?? null,
    dataVersion: (symbolRow as any)?.updated_at ?? null,
  };

  const stored = await readStored(db, symbol, timeframe, from, to);
  let coverage = checkCoverage({
    candles: stored.candles, from, to, timeframe, market, minRatio: opts.minRatio,
  });

  if (coverage.ok) {
    return {
      candles: stored.candles,
      source: {
        kind: "stored",
        providerCode: stored.providerCode ?? symbolRow?.source_code ?? "unknown",
        label: stored.providerCode ?? "stored history",
        isSynthetic: false,
      },
      symbolMeta,
      coverage,
      warning: coverage.gaps.length
        ? `${coverage.gaps.length} gap(s) detected in the stored series.`
        : undefined,
    };
  }

  // ---- On-demand backfill from the real provider -------------------------
  let attemptedBackfill = false;
  /** The import's failure message, whichever layer produced it. */
  let importError: string | undefined;
  let importErrorKind: "provider" | "infrastructure" | undefined;
  /** The thrown value itself, kept so the remedy can classify it. */
  let lastImportError: unknown;

  const routed = resolveHistoricalProvider(market, symbolRow?.source_code ?? null);

  if (opts.allowBackfill !== false && symbolRow && symbolRow.is_enabled !== false) {
    attemptedBackfill = true;
    try {
      const { runImport } = await import("./pipeline.server");
      await runImport({
        symbol,
        nativeSymbol: symbolRow.native_symbol ?? symbol,
        sourceCode: routed.code,
        market,
        timeframe: timeframe as any,
        from,
        to,
        triggeredBy: "on-demand",
        aggregateHigherTfs: timeframe === "1m" || timeframe === "1D",
      });
      const refreshed = await readStored(db, symbol, timeframe, from, to);
      coverage = checkCoverage({
        candles: refreshed.candles, from, to, timeframe, market, minRatio: opts.minRatio,
      });
      if (coverage.ok) {
        return {
          candles: refreshed.candles,
          source: {
            kind: "backfilled",
            providerCode: refreshed.providerCode ?? routed.code,
            label: `${routed.code} (imported on demand)`,
            isSynthetic: false,
          },
          symbolMeta: { ...symbolMeta, importedAt: new Date().toISOString() },
          coverage,
        };
      }
    } catch (e) {
      lastImportError = e;
      importError = e instanceof Error ? e.message : String(e);
      importErrorKind = isInfrastructureFailure(e) ? "infrastructure" : "provider";
      // An infrastructure fault is this deployment being broken, not a venue
      // saying no, so it is logged at error level rather than as a warning.
      const line = `[historical] on-demand import failed for ${symbol} ${timeframe} via ${routed.code} (${importErrorKind}): ${importError}`;
      if (importErrorKind === "infrastructure") console.error(line);
      else console.warn(line);
    }
  }


  // ---- Explicit demo mode ------------------------------------------------
  if (opts.allowSynthetic) {
    const { getSyntheticProvider } = await import("@/lib/replay/market-data");
    // Throws when ENABLE_SYNTHETIC_REPLAY is not set — intentional.
    const provider = getSyntheticProvider();
    const candles = (await provider.getCandles({ symbol, timeframe: timeframe as any, from, to })) as ServiceCandle[];
    return {
      candles,
      source: {
        kind: "synthetic",
        providerCode: provider.id,
        label: provider.label,
        isSynthetic: true,
      },
      symbolMeta: { ...symbolMeta, importedAt: new Date().toISOString(), dataVersion: null },
      coverage: checkCoverage({ candles, from, to, timeframe, market, minRatio: 0 }),
      warning: "These candles are generated demo data, not real market history.",
    };
  }

  // ---- Fail loudly -------------------------------------------------------
  const remedy = !symbolRow
    ? `${symbol} is not registered as a historical symbol. Add it in Admin → Market Data before replaying it.`
    : symbolRow.is_enabled === false
      ? `${symbol} is registered but disabled. Enable it in Admin → Market Data.`
      : importError
        ? importFailureRemedy(routed.code, lastImportError, importError)
        : `Run a historical import for ${symbol} · ${timeframe} covering this date range (provider: ${routed.code}).`;

  throw new HistoricalDataUnavailableError(
    describeCoverage(coverage, symbol, timeframe),
    {
      symbol, timeframe, from, to, coverage, remedy,
      registered: !!symbolRow,
      attemptedBackfill,
      providerError: importError,
      errorKind: importErrorKind,
    },
  );
}

/** Read-only coverage probe used by the creation wizard before a session exists. */
export async function probeCoverage(db: Db, opts: Omit<ResolveOptions, "allowSynthetic">) {
  const symbolRow = await findSymbolRow(db, opts.symbol);
  const market = opts.market ?? symbolRow?.market ?? "forex";
  const stored = await readStored(db, opts.symbol, opts.timeframe, opts.from, opts.to);
  const coverage = checkCoverage({
    candles: stored.candles, from: opts.from, to: opts.to,
    timeframe: opts.timeframe, market, minRatio: opts.minRatio,
  });
  // Same canonical routing the importer will use.
  const routed = resolveHistoricalProvider(market, symbolRow?.source_code ?? null);
  return {
    coverage,
    registered: !!symbolRow,
    enabled: symbolRow?.is_enabled !== false,
    sourceCode: symbolRow ? routed.code : null,
    routing: routed,
    message: describeCoverage(coverage, opts.symbol, opts.timeframe),
  };
}

