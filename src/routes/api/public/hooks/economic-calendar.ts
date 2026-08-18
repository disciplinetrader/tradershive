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
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

export const Route = createFileRoute("/api/public/hooks/economic-calendar")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/economic-calendar", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { syncEconomicCalendar } = await import("@/lib/economic-calendar/ingest.server");
        const result = await syncEconomicCalendar();

        return new Response(JSON.stringify({ ok: result.errors.length === 0, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
