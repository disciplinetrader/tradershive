/**
 * Cron endpoint — economic calendar sync.
 *
 * Bypasses site auth on published deployments, so it is guarded by the shared
 * cron secret exactly like the other scheduled jobs.
 *
 * **Schedule this DAILY.** The upstream publisher serves one week, forward
 * only, so a window missed is a window lost for ever; daily means a failed run
 * costs a day rather than a week. See `ingest.server.ts` for the measurements,
 * including why this source can never supply released values. The response
 * carries `windowFrom` / `windowTo` / `withActual` so a monitor can tell
 * "accumulating history" from "rewriting the same week".
 *
 * ── Two sources, one schedule ──────────────────────────────────────────────
 *
 * ForexFactory (`ingest.server.ts`) is the breadth source: every major
 * currency, forecasts, no outcomes, ever. moomoo `hot` (`moomoo.server.ts`)
 * is additive and narrow: ~0.4 US events/day, but with `actual` — the field
 * the overlay needs and FF structurally cannot supply. Both are daily and
 * neither depends on the other, so they share this route.
 *
 * They are reported as two items rather than one so a partial failure is a
 * 207 and not a 500: FF going down must not be indistinguishable from moomoo
 * going down, and losing the narrow source must not mask the broad one.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";
import { jobResponse } from "@/lib/cron-response";

export const Route = createFileRoute("/api/public/hooks/economic-calendar")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/economic-calendar", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { syncEconomicCalendar } = await import("@/lib/economic-calendar/ingest.server");
        const { syncMoomooCalendar } = await import("@/lib/economic-calendar/moomoo.server");

        // Sequential, not Promise.all: two independent upserts into the same
        // table, and concurrency buys nothing at this volume while making a
        // write conflict possible.
        const forexfactory = await syncEconomicCalendar();

        let moomoo: Awaited<ReturnType<typeof syncMoomooCalendar>> | null = null;
        let moomooError: string | null = null;
        try {
          moomoo = await syncMoomooCalendar();
        } catch (e) {
          // A throw here is configuration-shaped (missing key, bad key
          // material) rather than per-day — `syncMoomooCalendar` already
          // collects per-day failures internally. Caught so it cannot take the
          // ForexFactory result down with it.
          moomooError = e instanceof Error ? e.message : String(e);
        }

        const moomooFailed = moomooError !== null || (moomoo?.errors.length ?? 0) > 0;
        return jobResponse({
          forexfactory,
          moomoo: moomoo ?? { errors: [moomooError ?? "unknown error"] },
          failed: (forexfactory.errors.length > 0 ? 1 : 0) + (moomooFailed ? 1 : 0),
          total: 2,
        });
      }),
    },
  },
});
