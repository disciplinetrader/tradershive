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
 * currency, a forecast for most events, and no outcome, ever. Xoomar
 * (`xoomar.server.ts`) is additive and narrow: US high-signal releases only,
 * no forecast, but WITH the `actual` the overlay needs and FF structurally
 * cannot supply. Both are daily and neither depends on the other, so they
 * share this route.
 *
 * They are reported as two items rather than one so a partial failure is a
 * 207 and not a 500: FF going down must not be indistinguishable from Xoomar
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
        const { syncXoomarCalendar } = await import("@/lib/economic-calendar/xoomar.server");

        // Sequential, not Promise.all: two independent upserts into the same
        // table, and concurrency buys nothing at this volume while making a
        // write conflict possible.
        const forexfactory = await syncEconomicCalendar();

        let xoomar: Awaited<ReturnType<typeof syncXoomarCalendar>> | null = null;
        let xoomarError: string | null = null;
        try {
          xoomar = await syncXoomarCalendar();
        } catch (e) {
          // `syncXoomarCalendar` already collects fetch failures internally, so
          // a throw here is unexpected. Caught anyway: the narrow source must
          // never be able to take the breadth source's result down with it.
          xoomarError = e instanceof Error ? e.message : String(e);
        }

        const xoomarFailed = xoomarError !== null || (xoomar?.errors.length ?? 0) > 0;
        return jobResponse({
          forexfactory,
          xoomar: xoomar ?? { errors: [xoomarError ?? "unknown error"] },
          failed: (forexfactory.errors.length > 0 ? 1 : 0) + (xoomarFailed ? 1 : 0),
          total: 2,
        });
      }),
    },
  },
});
