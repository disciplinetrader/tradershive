/**
 * Cron: re-engagement drip.
 *
 * Bucketises inactive users into 3 / 7 / 14 / 30 day cohorts based on
 * `profiles.last_active_at` and enqueues the matching template. Dedupe keys
 * on the queue prevent double-sending inside a 24-hour window.
 * Recommended schedule: hourly.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";
import { jobResponse } from "@/lib/cron-response";

const BUCKETS: Array<{ days: 3 | 7 | 14 | 30; lo: number; hi: number }> = [
  { days: 3, lo: 3, hi: 4 },
  { days: 7, lo: 7, hi: 8 },
  { days: 14, lo: 14, hi: 15 },
  { days: 30, lo: 30, hi: 31 },
];

export const Route = createFileRoute("/api/public/hooks/email-reengagement")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/email-reengagement", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { triggerReengagement } = await import("@/lib/email/triggers.server");
        let enqueued = 0;
        for (const b of BUCKETS) {
          const hi = new Date(Date.now() - b.lo * 24 * 60 * 60 * 1000).toISOString();
          const lo = new Date(Date.now() - b.hi * 24 * 60 * 60 * 1000).toISOString();
          const { data: users } = await supabaseAdmin
            .from("profiles")
            .select("id, email, display_name, first_name")
            .gte("last_active_at", lo)
            .lt("last_active_at", hi)
            .not("email", "is", null)
            .limit(500);
          for (const u of (users ?? []) as any[]) {
            const result = await triggerReengagement(
              { email: u.email, userId: u.id, name: u.first_name ?? u.display_name },
              b.days,
            );
            if (result.ok) enqueued++;
          }
        }
        return jobResponse({ enqueued, failed: 0, total: enqueued });
      }),
    },
  },
});
