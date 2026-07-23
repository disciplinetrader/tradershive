/**
 * Automatic Battle Settlement Service.
 *
 * Runs every minute via pg_cron. Finds every battle whose scheduled window
 * has ended but whose status is still `live` and delegates to the
 * `finalize_battle(uuid)` RPC — which recomputes rankings, writes results,
 * awards XP + coins, sends notifications and flips status to `completed`
 * atomically.
 *
 * Idempotent by design: the source query filters on `status = 'live'`, so
 * a battle that was already settled is invisible to the next run. Errors on
 * one battle never block the others; every failure is logged and returned in
 * the response payload so the platform admin can audit outcomes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";

const BATCH_LIMIT = 50;

type Outcome = { battle_id: string; ok: boolean; error?: string; duration_ms: number };

export const Route = createFileRoute("/api/public/hooks/battle-settlement")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/battle-settlement", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const nowISO = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("battles")
          .select("id, name, end_at")
          .eq("status", "live")
          .lte("end_at", nowISO)
          .order("end_at", { ascending: true })
          .limit(BATCH_LIMIT);

        if (error) {
          console.error("[battle-settlement] fetch failed:", error);
          return json({ ok: false, stage: "fetch", error: error.message }, 500);
        }

        const results: Outcome[] = [];
        for (const battle of due ?? []) {
          const started = Date.now();
          try {
            const { error: rpcErr } = await supabaseAdmin.rpc("finalize_battle", {
              _battle_id: battle.id,
            });
            if (rpcErr) throw rpcErr;
            results.push({ battle_id: battle.id, ok: true, duration_ms: Date.now() - started });
            console.log(`[battle-settlement] settled ${battle.id} (${battle.name})`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[battle-settlement] failed ${battle.id}:`, msg);
            results.push({ battle_id: battle.id, ok: false, error: msg, duration_ms: Date.now() - started });
          }
        }

        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        return json({
          ok: true,
          processed: results.length,
          settled: okCount,
          failed: failCount,
          results,
          checked_at: nowISO,
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
