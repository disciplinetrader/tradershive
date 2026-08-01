/**
 * Cron endpoint — economic calendar sync.
 *
 * Bypasses site auth on published deployments, so it is guarded by the shared
 * cron secret exactly like the other scheduled jobs.
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
