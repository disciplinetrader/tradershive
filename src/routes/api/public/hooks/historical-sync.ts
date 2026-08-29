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
 * Queued admin jobs to execute per tick.
 *
 * ONE, and the number comes from the shape of the work rather than taste. The
 * scheduled phases run 2 forward plus 2 backward imports over ~2-day windows -
 * small, and the whole tick usually lands well under 20s (success p95 is
 * 14.6s). A queued ADMIN job is a 30-90 day range and can plausibly consume the
 * entire request on its own; the longest successful import observed is 105.5s.
 *
 * So at a drain limit of 2, starving the scheduled slice stops being an edge
 * case and becomes the normal outcome. One is the largest value that keeps
 * starvation exceptional. Override per call with `?drain=`.
 */
const DEFAULT_DRAIN_LIMIT = 1;

/**
 * Never START a queued job after this much of the request is gone.
 *
 * Guards against beginning work that cannot finish. It does not interrupt work
 * in flight: a claimed job runs to its own conclusion, because abandoning it
 * midway is precisely what manufactures the stale rows HD-6 cleans up.
 */
const QUEUE_START_DEADLINE_MS = 30_000;

/**
 * Skip the scheduled phases entirely past this point.
 *
 * Sized against the 105.5s longest observed successful import: 60s leaves real
 * headroom, and a slice started at 61s that then needs 40s would be racing the
 * platform for no benefit. Skipping is cheap because both phases order by
 * `latest_imported ASC NULLS FIRST` - a symbol passed over this tick sorts
 * first on the next one, so nothing is permanently starved and a missed slice
 * costs 15 minutes.
 */
const SCHEDULED_SKIP_AFTER_MS = 60_000;

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
 * Head-of-line blocking by design, in other words.
 *
 * It applies to the AUTOMATIC slice only. An explicit `?symbol=` bypasses it,
 * so a named symbol can still be probed from the deployment — which is the
 * only place CX-1 can be measured, since the block is on the origin IP.
 *
 * DORMANT SINCE 2026-08-28, AND KEPT ON PURPOSE. Crypto now routes to Bybit,
 * so no enrolled symbol resolves to Binance and this list currently excludes
 * nothing. It stays because `historical_symbols` is edited by hand: a row
 * re-added with `source_code = 'binance'` would sort first for ever under
 * `latest_imported ASC NULLS FIRST`, fail permanently against CX-1, and starve
 * the slice again — silently, because a failing symbol never advances its own
 * cursor. The guard costs nothing while empty and prevents a regression that
 * presents as "sync stopped working" rather than as a bad row.
 *
 * Delete it only when Binance is reachable from the deployment, not merely
 * when nothing routes there.
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

        // One clock for every budget decision in this handler.
        const handlerStart = Date.now();

        // `limit` may come from the query string or the JSON body, so the cron
        // command and a manual curl can both set it.
        const url = new URL(request.url);
        const body = await request.json().catch(() => ({}) as Record<string, unknown>);
        const raw = Number(url.searchParams.get("limit") ?? (body as { limit?: unknown }).limit);
        const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;
        const symbolFilter = url.searchParams.get("symbol") ?? undefined;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runIncrementalUpdate, runBackwardUpdate, sweepStaleImportJobs, drainQueuedJobs } =
          await import("@/lib/market-data/historical/pipeline.server");

        // ---- Phase 0 - reap jobs whose request died --------------------------
        //
        // `runImport` writes its terminal status from inside its own handler, so
        // a request killed by the platform leaves the row `running` for ever and
        // nothing else is responsible for it. 21 such rows accumulated between
        // 2026-08-19 and 2026-08-28 (HD-6).
        //
        // Here because this endpoint is already scheduled and already holds an
        // admin client - it needs no new cron entry and no new secret. It runs
        // BEFORE the slices because it is cheap and because a stale row should
        // not survive a tick that failed for unrelated reasons.
        //
        // Never allowed to break the sync: a sweep fault is reported in the
        // response body, not thrown. The sync is the job; the sweep is hygiene.
        let staleSweep: Record<string, unknown>;
        try {
          staleSweep = { ...(await sweepStaleImportJobs(supabaseAdmin)) };
        } catch (e) {
          console.error("[historical-sync] stale sweep failed", e);
          staleSweep = { error: e instanceof Error ? e.message : String(e) };
        }

        // ---- Phase 1 - drain admin-enqueued jobs ----------------------------
        //
        // AFTER the sweep, deliberately. The sweep releases rows whose request
        // died; running it first means a job stuck `running` from a previous
        // tick is already marked failed and cannot be mistaken for live work.
        //
        // BEFORE the scheduled phases, also deliberately. Admin work is
        // explicitly requested by a person who is watching for it, while the
        // scheduled slice is self-healing: it orders by `latest_imported ASC
        // NULLS FIRST`, so anything it misses sorts first next tick.
        //
        // These jobs exist at all because a manual import must not perform the
        // provider fetch itself - the browser-triggered colo reaches Bybit from
        // an egress that CloudFront refuses. See `enqueueImportJob`.
        const rawDrain = Number(
          url.searchParams.get("drain") ?? (body as { drain?: unknown }).drain,
        );
        const drainLimit = Number.isFinite(rawDrain) && rawDrain >= 0
          ? Math.min(Math.floor(rawDrain), MAX_LIMIT)
          : DEFAULT_DRAIN_LIMIT;

        let queueDrain: Record<string, unknown>;
        try {
          queueDrain = drainLimit === 0
            ? { skipped: "drain=0" }
            : {
                ...(await drainQueuedJobs(supabaseAdmin, {
                  limit: drainLimit,
                  startedAt: handlerStart,
                  deadlineMs: QUEUE_START_DEADLINE_MS,
                })),
              };
        } catch (e) {
          // Hygiene must never take the sync with it, same rule as the sweep.
          console.error("[historical-sync] queue drain failed", e);
          queueDrain = { error: e instanceof Error ? e.message : String(e) };
        }

        // Point 8: do not begin work that cannot safely complete.
        const elapsedAfterDrain = Date.now() - handlerStart;
        const scheduledSkipped = elapsedAfterDrain >= SCHEDULED_SKIP_AFTER_MS
          ? `budget: ${Math.round(elapsedAfterDrain / 1000)}s elapsed before the scheduled slice`
          : null;

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
        for (const s of scheduledSkipped ? [] : (symbols ?? [])) {
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
        if (scheduledSkipped) {
          backfillSkipped = scheduledSkipped;
        } else if (throttled) {
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
          // Counts only. A zero sweep and an empty drain write no log line
          // anywhere; this is how both stay observable without one.
          staleSweep,
          queueDrain,
          scheduledSkipped,
          elapsedMs: Date.now() - handlerStart,
        });
      }),
    },
  },
});
