/**
 * Cron: process pending email queue jobs.
 * Trigger every minute via pg_cron.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

export const Route = createFileRoute("/api/public/hooks/email-queue")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/email-queue", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { processQueueBatch } = await import("@/lib/email/service.server");
        const outcome = await processQueueBatch(50);
        return new Response(JSON.stringify({ ok: true, ...outcome }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
