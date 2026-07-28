/**
 * Cron: process pending email queue jobs.
 * Trigger every minute via pg_cron.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";

export const Route = createFileRoute("/api/public/hooks/email-queue")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/email-queue", async () => {
        const { processQueueBatch } = await import("@/lib/email/service.server");
        const outcome = await processQueueBatch(50);
        return new Response(JSON.stringify({ ok: true, ...outcome }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
