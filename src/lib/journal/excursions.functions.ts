/**
 * Excursion computation — server side, because it reads the historical tape.
 *
 * The refusal to use synthetic candles lives here, at the point the data is
 * requested (`allowSynthetic: false`) AND again after it returns
 * (`source.isSynthetic`). Two checks rather than one because the first is a
 * request and the second is a fact, and a fabricated MAE is the single most
 * convincing wrong number this product could display.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/server-errors";
import { findSymbol } from "@/lib/paper-trading/symbols";
import {
  HistoricalDataUnavailableError,
  resolveHistoricalRange,
} from "@/lib/market-data/historical/service.server";
import { TF_MS } from "@/lib/market-data/historical/coverage";
import { capPath, computeExcursions, timeframeFor } from "@/lib/journal/excursions";
import type { Json, Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The request-scoped, RLS-bound client the auth middleware puts on context. */
type SupabaseLike = SupabaseClient<Database>;

export type ExcursionOutcome =
  | { ok: true; entryId: string; maeR: number | null; mfeR: number | null; points: number; timeframe: string; source: string }
  | { ok: false; entryId: string; reason: string };

/**
 * Why an entry has no excursion.
 *
 * The whole point of this vocabulary is that `mfe_r IS NULL` has three
 * meanings and only one of them should ever be retried:
 *
 *   ok        measured
 *   no_stop   TERMINAL. `mfeR` is mfePnl/riskPnl, so with no stop there is no
 *             R to compute — ever. `mfePnl` is still stored and still useful.
 *   unusable  TERMINAL. No fill price, no size, no times, unknown symbol, or an
 *             inverted range. Nothing about re-running changes any of that.
 *   no_data   RETRYABLE. No non-synthetic candles cover the window today;
 *             historical coverage improves over time.
 *   error     RETRYABLE. Provider failure or rate limit. A rate limit MUST land
 *             here and never in `no_data`, or a transient budget ceiling
 *             permanently excludes a perfectly computable trade.
 *
 * Recorded in `excursion_status` with `excursion_attempted_at`, both separate
 * from `excursion_computed_at` — the journal panel reads that one as "this was
 * measured", so writing it on a failure would make a failed attempt render as a
 * successful measurement.
 */
export type ExcursionStatus = "ok" | "no_stop" | "no_data" | "unusable" | "error";

/** Statuses worth attempting again. Everything else is settled. */
export const RETRYABLE_STATUSES: ExcursionStatus[] = ["no_data", "error"];

export type ExcursionAttempt = {
  entryId: string;
  status: ExcursionStatus;
  reason?: string;
  /** True when a provider call was actually made — the budget only counts these. */
  hitProvider: boolean;
  /** Set when the provider refused for rate reasons; the caller should stop. */
  rateLimited?: boolean;
};

type EntryRow = {
  id: string; symbol: string | null; market: string | null; direction: string | null;
  entry_price: number | null; stop_loss: number | null; lot_size: number | null;
  opened_at: string | null; closed_at: string | null;
};

const ENTRY_COLUMNS =
  "id, symbol, market, direction, entry_price, stop_loss, lot_size, opened_at, closed_at";

function looksRateLimited(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes("429") || m.includes("rate") || m.includes("quota") || m.includes("credit");
}

/**
 * Measure one entry and persist the outcome. Shared by the single-entry server
 * function and the batch backfill so there is exactly one implementation of
 * what an attempt means — two would drift, and the statuses are the contract.
 */
export async function attemptExcursion(
  supabase: SupabaseLike,
  userId: string,
  entry: EntryRow,
): Promise<ExcursionAttempt> {
  const stamp = new Date().toISOString();
  const settle = async (status: ExcursionStatus, reason?: string, hitProvider = false, rateLimited = false) => {
    // Unwrapped, because the SUCCESS path below already throws on a failed
    // write and the two must agree. Discarding this result meant a failed
    // status write left the row unmarked, so a TERMINAL row stayed eligible
    // and the backfill re-attempted it on every run, forever, against a
    // metered provider — with nothing logged. PAT-1.
    unwrap(
      await supabase
        .from("journal_entries")
        .update({ excursion_status: status, excursion_attempted_at: stamp })
        .eq("id", entry.id)
        .eq("user_id", userId),
      "attemptExcursion/settle",
    );
    return { entryId: entry.id, status, reason, hitProvider, rateLimited } satisfies ExcursionAttempt;
  };

  if (!entry.symbol) return settle("unusable", "No symbol on this entry");
  if (!entry.opened_at || !entry.closed_at) return settle("unusable", "Entry has no open/close time");
  if (entry.entry_price == null || entry.lot_size == null) {
    return settle("unusable", "Entry has no fill price or size");
  }
  const sym = findSymbol(entry.symbol);
  if (!sym) return settle("unusable", `Unknown symbol ${entry.symbol}`);

  const from = Date.parse(entry.opened_at);
  const to = Date.parse(entry.closed_at);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return settle("unusable", "Entry has an unusable time range");
  }

  const timeframe = timeframeFor(to - from);

  // A trade shorter than one candle is TERMINAL, and it is a fact about the
  // TRADE rather than about the data. There is no timeframe that helps: 1m is
  // already the finest series this product stores, so a 40-second scalp has no
  // candle series at any resolution, today or ever.
  //
  // Measuring it from the single candle that CONTAINS it would be worse than
  // refusing. That candle's high and low describe a minute the trade occupied a
  // fraction of, so the MAE/MFE it yields is a real number for the wrong
  // window — the fabricated-measurement failure this whole module refuses.
  //
  // Recorded as `unusable`, not `no_data`: no_data is retryable, and 18 of the
  // 41 rows queued on 2026-08-27 were exactly this shape, re-attempted every
  // batch at ~22s each against a metered provider, forever.
  const step = TF_MS[timeframe] ?? 0;
  if (step > 0 && to - from < step) {
    const secs = Math.round((to - from) / 1000);
    return settle("unusable", `Trade lasted ${secs}s — shorter than one ${timeframe} candle`);
  }

  let resolved;
  try {
    resolved = await resolveHistoricalRange(supabase, {
      symbol: entry.symbol, timeframe, from, to,
      market: entry.market ?? undefined,
      allowBackfill: true,
      allowSynthetic: false,
    });
  } catch (e) {
    if (e instanceof HistoricalDataUnavailableError) {
      return settle("no_data", `No historical data for ${entry.symbol} at ${timeframe}`, true);
    }
    // A rate limit is TRANSIENT. Recording it as `no_data` would bury a
    // computable trade behind a budget ceiling that clears in a minute.
    if (looksRateLimited(e)) {
      return settle("error", "Provider rate limit", true, true);
    }
    return settle("error", e instanceof Error ? e.message.slice(0, 200) : "Provider error", true);
  }

  if (resolved.source.isSynthetic || resolved.source.kind === "synthetic") {
    return settle("no_data", "Refused: only synthetic data available", true);
  }
  if (resolved.candles.length === 0) return settle("no_data", "No candles in the trade's window", true);

  const result = computeExcursions({
    sym,
    direction: entry.direction === "short" ? "short" : "long",
    entryPrice: Number(entry.entry_price),
    stopLoss: entry.stop_loss == null ? null : Number(entry.stop_loss),
    lotSize: Number(entry.lot_size),
    candles: resolved.candles,
  });
  if (!result) return settle("no_data", "Could not compute from this window", true);

  const pathJson: Json = capPath(result.path).map((p) => ({ t: p.t, pnl: p.pnl }));
  const { error } = await supabase
    .from("journal_entries")
    .update({
      mae_price: result.maePrice,
      mfe_price: result.mfePrice,
      mae_r: result.maeR,
      mfe_r: result.mfeR,
      excursion_path: pathJson,
      excursion_timeframe: timeframe,
      excursion_source: resolved.source.kind,
      excursion_computed_at: stamp,
      excursion_attempted_at: stamp,
      // `mfeR` is null without a stop, and that is TERMINAL for Ideal RR even
      // though the measurement itself succeeded — mfePnl is real and stored.
      excursion_status: result.mfeR == null ? "no_stop" : "ok",
    })
    .eq("id", entry.id)
    .eq("user_id", userId);
  if (error) throw error;

  return {
    entryId: entry.id,
    status: result.mfeR == null ? "no_stop" : "ok",
    hitProvider: true,
  };
}

export const computeEntryExcursion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ExcursionOutcome> => {
    const { supabase, userId } = context;

    const entry = unwrap(
      await supabase
        .from("journal_entries")
        .select(ENTRY_COLUMNS)
        .eq("id", data.entryId)
        .eq("user_id", userId)
        .maybeSingle(),
      "computeEntryExcursion/journal_entries",
    ) as EntryRow | null;
    if (!entry) return { ok: false, entryId: data.entryId, reason: "Entry not found" };

    // One implementation of what an attempt MEANS, shared with the backfill.
    // Two would drift, and the statuses are the contract the retry queue reads.
    const res = await attemptExcursion(supabase, userId, entry);
    if (res.status === "ok" || res.status === "no_stop") {
      const row = unwrap(
        await supabase
          .from("journal_entries")
          .select("mae_r, mfe_r, excursion_timeframe, excursion_source, excursion_path")
          .eq("id", entry.id)
          .eq("user_id", userId)
          .maybeSingle(),
        "computeEntryExcursion/readback",
      );
      return {
        ok: true,
        entryId: entry.id,
        maeR: row?.mae_r ?? null,
        mfeR: row?.mfe_r ?? null,
        points: Array.isArray(row?.excursion_path) ? row.excursion_path.length : 0,
        timeframe: String(row?.excursion_timeframe ?? ""),
        source: String(row?.excursion_source ?? ""),
      };
    }
    return { ok: false, entryId: entry.id, reason: res.reason ?? res.status };
  });

/* ══════════════════════════════════════════════════════════════════════
   Batch backfill
   ══════════════════════════════════════════════════════════════════════ */

export type BackfillResult = {
  processed: number;
  ok: number;
  /** Attempted and settled TERMINALLY — no_stop or unusable. */
  terminal: number;
  /** Attempted and failed retryably — no_data or error. */
  retryable: number;
  /** Entries still eligible after this batch. Drives the caller's loop. */
  remaining: number;
  /** Provider calls actually made. Cached ranges cost nothing and are excluded. */
  providerCalls: number;
  /** The provider refused on rate. The caller should pause, not fail. */
  rateLimited: boolean;
  /** Returned on the time budget with rows left in hand. NOT an error. */
  budgetExhausted: boolean;
};

/**
 * The work queue, as a QUERY rather than a job record.
 *
 * Progress lives in the rows: an entry leaves the queue by acquiring a
 * `excursion_computed_at` or a terminal status. That makes the whole thing
 * self-resuming — kill it mid-run and re-run, and it picks up exactly where it
 * stopped, because finished rows no longer match. A job table would be a second
 * source of truth that can disagree with the data it describes.
 */
const ELIGIBLE = "excursion_computed_at.is.null";

export const backfillExcursions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    /** Upper bound on rows FETCHED. The time budget decides how many are attempted. */
    limit: z.number().int().min(1).max(25).default(25),
  }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<BackfillResult> => {
    const { supabase, userId } = context;

    const countEligible = async (): Promise<number> => {
      const { count } = await supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("deleted_at", null)
        .not("closed_at", "is", null)
        .is("excursion_computed_at", null)
        .or(`excursion_status.is.null,excursion_status.in.(${RETRYABLE_STATUSES.join(",")})`);
      return count ?? 0;
    };

    const rows = unwrap(
      await supabase
        .from("journal_entries")
        .select(ENTRY_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .not("closed_at", "is", null)
        .is("excursion_computed_at", null)
        .or(`excursion_status.is.null,excursion_status.in.(${RETRYABLE_STATUSES.join(",")})`)
        .order("closed_at", { ascending: false })
        .limit(data.limit),
      "backfillExcursions/journal_entries",
    ) as EntryRow[];

    let ok = 0, terminal = 0, retryable = 0, providerCalls = 0, rateLimited = false;
    let processed = 0, budgetExhausted = false;
    const startedAt = Date.now();

    // SERIAL, never parallel. Parallelism is what turns a rate budget into a
    // burst, and the whole point of the throttle is to stay under a ceiling
    // this run does not own.
    for (const row of rows) {
      // Return on a TIME budget rather than after a fixed row count.
      //
      // This request has a hard ceiling it does not control: the deployment
      // sits behind Cloudflare, which gives up on a request that has not sent
      // response headers within 100 seconds. A batch sized in ROWS cannot
      // respect that, because per-row cost is not a constant — it was ~11s for
      // a symbol with stored candles and ~22s for one that fell through to the
      // import pipeline's retry cascade on 2026-08-27, and both numbers move
      // the moment either of those paths changes. A fixed size tuned to
      // today's timings is wrong by tomorrow.
      //
      // Budgeting time is stable across all of that: whatever each row costs,
      // the request returns before the proxy kills it, with everything
      // finished so far already committed to the rows.
      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        budgetExhausted = true;
        break;
      }
      if (providerCalls > 0) await sleep(PROVIDER_GAP_MS);
      const res = await attemptExcursion(supabase, userId, row);
      processed += 1;
      if (res.hitProvider) providerCalls += 1;
      if (res.status === "ok") ok += 1;
      else if (res.status === "no_stop" || res.status === "unusable") terminal += 1;
      else retryable += 1;

      if (res.rateLimited) {
        // Stop the batch: the ceiling is transient, the rows stay eligible, and
        // the caller decides when to resume. Failing the whole run here would
        // discard the work already committed above.
        rateLimited = true;
        break;
      }
    }

    return {
      processed,
      ok, terminal, retryable,
      remaining: await countEligible(),
      providerCalls,
      rateLimited,
      budgetExhausted,
    };
  });

/** Spacing between provider calls, in ms. See MD-1 for the documented budget. */
const PROVIDER_GAP_MS = 8_000;

/**
 * Wall-clock budget for ONE request, in ms.
 *
 * 60s against Cloudflare's 100s ceiling. The gap is deliberate and is not
 * slack to be reclaimed: the check happens BEFORE a row is attempted, so a row
 * started at 59s still gets to finish, and the slowest row observed cost ~22s.
 * 60 + 22 leaves ~18s for the closing `countEligible` and the response.
 */
const TIME_BUDGET_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How much of a history is measurable, for the progress UI. */
export const excursionCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const base = () => supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("closed_at", "is", null);

    const [{ count: total }, { count: measured }, { count: terminal }] = await Promise.all([
      base(),
      base().not("excursion_computed_at", "is", null),
      base().is("excursion_computed_at", null).in("excursion_status", ["no_stop", "unusable"]),
    ]);
    const t = total ?? 0, m = measured ?? 0, term = terminal ?? 0;
    return { total: t, measured: m, terminal: term, pending: Math.max(0, t - m - term) };
  });
