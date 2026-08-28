/**
 * Cron endpoint — historical data sync.
 *
 * Runs a SLICE of the catalog per invocation, stalest first. It used to loop
 * every enabled symbol in one request, which does not survive contact with the
 * providers: Binance pages at 1000 bars with a 120 ms throttle and is
 * self-limiting, but Twelve Data pages at 5000 with no delay between pages and
 * none between symbols. Against a measured 8 credits/min, ~20 Twelve Data
 * symbols at 1–9 pages each hit the rate limit within seconds, and on 429 the
 * loop caught per symbol and carried on with no backoff — so one throttle
 * poisoned the rest of the run. A 33-symbol serial pass also risks exceeding
 * the platform's own execution limit regardless of what pg_net's timeout says.
 *
 * Ordering is `latest_imported ASC NULLS FIRST`, which the import pipeline
 * already maintains. Never-synced symbols sort first, and each run leaves the
 * ones it touched at the back — so successive runs cycle the catalog without
 * any offset state to store or get out of step.
 *
 * Per-symbol failures are still caught and collected: one bad symbol must not
 * kill the rest of the slice. What changed is that they now reach the HTTP
 * status via `jobResponse` — 207 for a partial slice, 500 if nothing in it
 * succeeded — because `net._http_response.status_code` is the only monitoring
 * surface these jobs have.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";
import { jobResponse } from "@/lib/cron-response";

/**
 * Symbols per run, per phase. Sized to the measured 8 credits/min budget.
 *
 * Every symbol's base timeframe is 1m, so one forward step (~1 day, 1,440
 * bars) and one backward step (2 days, 2,880 bars) each fit a single 5,000-bar
 * Twelve Data page — one credit apiece. So a run costs
 * `forward + backward` credits, fired with no inter-symbol delay.
 *
 * 2 + 2 = 4 credits per run. At the 15-minute cadence this is scheduled on
 * that is 384/day against the 800/day cap, and a 4/min peak against 8/min —
 * roughly 2x headroom on both.
 *
 * The previous default of 8, forward-only, fired 8 credits near-instantly:
 * exactly at the per-minute cap with no margin, which is why adding a second
 * phase to it would have guaranteed a 429 on the very first run rather than
 * merely risking one.
 */
const DEFAULT_LIMIT = 2;
const MAX_LIMIT = 33;
const DEFAULT_BACKFILL_LIMIT = 2;

/**
 * Sources that cannot succeed, excluded from the slice entirely.
 *
 * Binance answers 403 with an HTML body to this deployment's egress and does
 * so permanently (CX-1) — it is a geo/datacenter block, not an outage. The
 * eight crypto symbols route there, and they matter here for a structural
 * reason rather than a wasteful one: `latest_imported` only advances on a
 * successful write, so a permanently-failing symbol keeps sorting first under
 * `ASC NULLS FIRST` for ever. At a slice of 2 those eight would occupy every
 * slot of every run, the 25 reachable symbols would never sync, and — because
 * the backward phase is gated on a clean forward phase — depth would never be
 * built either.
 *
 * Head-of-line blocking by design, in other words. Remove this when CX-1 is
 * resolved; until then it is the difference between a job that works and one
 * that spins.
 *
 * It applies to the AUTOMATIC slice only. An explicit `?symbol=` bypasses it,
 * so a named symbol can still be probed from the deployment — which is the
 * only place CX-1 can be measured, since the block is on the origin IP.
 */
const UNREACHABLE_SOURCES = ["binance"];

/**
 * Does a failure mean we should stop spending credits this run?
 *
 * Only a throttle does. The gate exists because pushing more requests into a
 * rate limit is how one 429 poisoned a whole run before — but a 403, a bad
 * symbol or a parse error consumes no further budget, and treating those as a
 * reason to skip the backward phase would stall depth on an unrelated fault.
 */
function isThrottle(message: unknown): boolean {
  return /rate limit|429|too many requests/i.test(String(message ?? ""));
}

export const Route = createFileRoute("/api/public/hooks/historical-sync")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/historical-sync", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        // `limit` may come from the query string or the JSON body, so the cron
        // command and a manual curl can both set it.
        const url = new URL(request.url);
        const body = await request.json().catch(() => ({}) as Record<string, unknown>);
        const raw = Number(url.searchParams.get("limit") ?? (body as { limit?: unknown }).limit);
        const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;
        const symbolFilter = url.searchParams.get("symbol") ?? undefined;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runIncrementalUpdate, runBackwardUpdate } =
          await import("@/lib/market-data/historical/pipeline.server");

        let query = supabaseAdmin
          .from("historical_symbols")
          .select("id, symbol, native_symbol, source_code, base_timeframe, latest_imported, earliest_available, metadata")
          .eq("is_enabled", true);

        // A single-symbol run, for verifying one instrument without spending
        // the budget on the whole slice.
        //
        // An explicit `?symbol=` BYPASSES `UNREACHABLE_SOURCES`, and that is
        // the point of it. The exclusion exists to stop a permanently-failing
        // provider starving the AUTOMATIC slice — head-of-line blocking under
        // `latest_imported ASC NULLS FIRST`. A named single symbol is not a
        // slice and cannot starve anything, so the reason does not apply.
        //
        // It did apply the filter first until 2026-08-28, which made the one
        // documented way to re-test CX-1 — `?symbol=BTC/USDT` — match zero
        // rows and return 200 with an empty result. A reachability probe that
        // reports success while asking nothing is worse than no probe: it
        // answers the question wrongly rather than declining to answer.
        if (symbolFilter) query = query.eq("symbol", symbolFilter);
        else query = query.not("source_code", "in", `(${UNREACHABLE_SOURCES.join(",")})`);

        const { data: symbols, error } = await query
          .order("latest_imported", { ascending: true, nullsFirst: true })
          .order("priority", { ascending: true })
          .limit(limit);
        if (error) throw error;

        const results: Array<Record<string, unknown>> = [];
        for (const s of symbols ?? []) {
          try {
            const r = await runIncrementalUpdate(s as never);
            results.push({ symbol: s.symbol, ok: true, ...(typeof r === "object" ? r : {}) });
          } catch (e) {
            // Deliberately swallowed per symbol so the slice completes — but
            // counted below, which is what was missing.
            console.error("[historical-sync] symbol failed", s.symbol, e);
            results.push({ symbol: s.symbol, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        const failed = results.filter((r) => r.ok === false).length;

        // ---- Phase 2 · HD-1 backward depth ---------------------------------
        //
        // Forward first, always: today's bars are the time-critical half, and
        // a backward step that ate the run would delay them.
        //
        // Gated on a THROTTLE in the forward phase, not on any failure.
        // Pushing more requests into a rate limit is how one 429 poisoned a
        // whole run before; an unrelated fault consumes no further budget and
        // must not stall depth. Skipping is cheap either way — depth is
        // measured in days and a missed slice costs 15 minutes.
        const backfill: Array<Record<string, unknown>> = [];
        let backfillSkipped: string | null = null;

        const throttled = results.some((r) => r.ok === false && isThrottle(r.error));
        if (throttled) {
          backfillSkipped = "forward phase hit a rate limit";
        } else {
          const rawBack = Number(
            url.searchParams.get("backfill") ?? (body as { backfill?: unknown }).backfill,
          );
          const backLimit = Number.isFinite(rawBack) && rawBack >= 0
            ? Math.min(Math.floor(rawBack), MAX_LIMIT)
            : DEFAULT_BACKFILL_LIMIT;

          if (backLimit === 0) {
            backfillSkipped = "backfill=0";
          } else {
            // Shallowest first: the symbol whose history starts LATEST has the
            // least depth and gains most from a step. Nulls last — a symbol
            // with no bars at all has no back edge, and the forward seed owns
            // that case.
            let backQuery = supabaseAdmin
              .from("historical_symbols")
              .select("id, symbol, native_symbol, source_code, base_timeframe, earliest_available, metadata")
              .eq("is_enabled", true)
              .not("source_code", "in", `(${UNREACHABLE_SOURCES.join(",")})`);
            if (symbolFilter) backQuery = backQuery.eq("symbol", symbolFilter);

            const { data: backSymbols, error: backErr } = await backQuery
              .order("earliest_available", { ascending: false, nullsFirst: false })
              .limit(backLimit);
            if (backErr) throw backErr;

            for (const s of backSymbols ?? []) {
              try {
                const r = await runBackwardUpdate(s as never);
                backfill.push({ symbol: s.symbol, ok: true, ...(typeof r === "object" ? r : {}) });
              } catch (e) {
                console.error("[historical-sync] backfill failed", s.symbol, e);
                backfill.push({
                  symbol: s.symbol, ok: false,
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }
          }
        }

        const backfillFailed = backfill.filter((r) => r.ok === false).length;

        return jobResponse({
          synced: results.length,
          failed: failed + backfillFailed,
          total: results.length + backfill.length,
          limit,
          results,
          backfill,
          backfillSkipped,
        });
      }),
    },
  },
});
