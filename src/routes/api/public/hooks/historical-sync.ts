/**
 * Cron endpoint — nightly historical data sync.
 * Bypasses auth on published sites; secured by the Supabase anon apikey
 * header (the standard pattern for /api/public/* cron hooks).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/historical-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey) return new Response("Missing apikey", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runIncrementalUpdate } = await import("@/lib/market-data/historical/pipeline.server");

        const { data: symbols, error } = await supabaseAdmin
          .from("historical_symbols")
          .select("id, symbol, native_symbol, source_code, base_timeframe")
          .eq("is_enabled", true)
          .order("priority", { ascending: true });
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const results: unknown[] = [];
        for (const s of symbols ?? []) {
          try {
            const r = await runIncrementalUpdate(s as any);
            results.push({ symbol: s.symbol, ok: true, ...(typeof r === "object" ? r : {}) });
          } catch (e) {
            results.push({ symbol: s.symbol, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        return new Response(JSON.stringify({ ok: true, synced: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
