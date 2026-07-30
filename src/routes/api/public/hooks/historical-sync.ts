/**
 * Cron endpoint — nightly historical data sync.
 * Bypasses auth on published sites; secured by a dedicated shared secret
 * (HISTORICAL_SYNC_CRON_SECRET) with constant-time comparison.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

export const Route = createFileRoute("/api/public/hooks/historical-sync")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/historical-sync", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runIncrementalUpdate } = await import("@/lib/market-data/historical/pipeline.server");

        const { data: symbols, error } = await supabaseAdmin
          .from("historical_symbols")
          .select("id, symbol, native_symbol, source_code, base_timeframe")
          .eq("is_enabled", true)
          .order("priority", { ascending: true });
        if (error) throw error;

        const results: unknown[] = [];
        for (const s of symbols ?? []) {
          try {
            const r = await runIncrementalUpdate(s as any);
            results.push({ symbol: s.symbol, ok: true, ...(typeof r === "object" ? r : {}) });
          } catch (e) {
            console.error("[historical-sync] symbol failed", s.symbol, e);
            results.push({ symbol: s.symbol, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        return new Response(JSON.stringify({ ok: true, synced: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
