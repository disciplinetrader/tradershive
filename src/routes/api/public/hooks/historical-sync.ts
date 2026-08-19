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

/** Symbols per run. Sized to the measured 8 credits/min Twelve Data budget. */
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 33;

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
        const { runIncrementalUpdate } = await import("@/lib/market-data/historical/pipeline.server");

        let query = supabaseAdmin
          .from("historical_symbols")
          .select("id, symbol, native_symbol, source_code, base_timeframe, latest_imported")
          .eq("is_enabled", true);
        // A single-symbol run, for verifying one instrument without spending
        // the budget on the whole slice.
        if (symbolFilter) query = query.eq("symbol", symbolFilter);

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
        return jobResponse({
          synced: results.length,
          failed,
          total: results.length,
          limit,
          results,
        });
      }),
    },
  },
});
