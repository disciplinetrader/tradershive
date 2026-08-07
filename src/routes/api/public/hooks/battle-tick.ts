/**
 * Battle state machine tick.
 *
 * Runs every minute via pg_cron -> net.http_post, matching the convention used
 * by the other scheduled hooks in this directory. Delegates to the
 * `tick_battles()` RPC, which walks every in-flight battle through
 * `upcoming -> open -> filling -> ready -> countdown -> live -> completed` and
 * processes the matchmaking queue.
 *
 * Every transition inside `tick_battle()` is gated on a timestamp and asserts
 * the expected status in its WHERE clause, so this endpoint is idempotent —
 * calling it twice in the same second does nothing the first call didn't.
 *
 * This is the backstop for battles nobody has open in a browser. It cannot
 * drive the 10-second `countdown -> live` edge at a one-minute cadence; the
 * battle detail route calls the per-battle `tick_battle(uuid)` RPC on a short
 * poll for that.
 *
 * Supersedes `battle-settlement`, which only ever called `finalize_battle` on
 * battles already `live` and so could not advance a battle to `live` in the
 * first place. Unschedule that job when this one is scheduled, or two
 * finalizers race on the same rows.
 *
 * The response body reports the in-flight fleet after ticking, so a job that is
 * running but achieving nothing is visible in `net._http_response` without
 * needing platform logs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

const IN_FLIGHT = ["upcoming", "open", "filling", "ready", "countdown", "live"] as const;

export const Route = createFileRoute("/api/public/hooks/battle-tick")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/battle-tick", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const started = Date.now();
        const { error } = await supabaseAdmin.rpc("tick_battles");
        if (error) {
          console.error("[battle-tick] tick_battles failed:", error);
          return json({ ok: false, stage: "tick_battles", error: error.message }, 500);
        }

        const { data: rows, error: readErr } = await supabaseAdmin
          .from("battles")
          .select("status")
          .in("status", IN_FLIGHT);

        if (readErr) {
          console.error("[battle-tick] post-tick read failed:", readErr);
          return json({ ok: true, ticked: true, in_flight: null, error: readErr.message });
        }

        const inFlight: Record<string, number> = {};
        for (const row of rows ?? []) {
          inFlight[row.status] = (inFlight[row.status] ?? 0) + 1;
        }

        console.log(
          `[battle-tick] ok in ${Date.now() - started}ms · in-flight:`,
          JSON.stringify(inFlight),
        );

        return json({
          ok: true,
          ticked: true,
          in_flight: inFlight,
          duration_ms: Date.now() - started,
          checked_at: new Date().toISOString(),
        });
      }),
    },
  },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
