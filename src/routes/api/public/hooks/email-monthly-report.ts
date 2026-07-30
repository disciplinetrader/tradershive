/**
 * Cron: enqueue monthly performance reports. Suggested schedule: 1st of month at 09:00 UTC.
 * Mirrors the weekly-report route but with a 30-day window.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export const Route = createFileRoute("/api/public/hooks/email-monthly-report")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/email-monthly-report", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { triggerMonthlyReport } = await import("@/lib/email/triggers.server");

        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const periodLabel = new Date(since).toLocaleString("en-US", { month: "long", year: "numeric" });

        const { data: prefs } = await supabaseAdmin
          .from("email_preferences")
          .select("user_id")
          .eq("master_enabled", true)
          .eq("monthly_report", true);
        const eligibleIds = (prefs ?? []).map((r: { user_id: string }) => r.user_id);
        if (eligibleIds.length === 0) {
          return new Response(JSON.stringify({ ok: true, enqueued: 0 }), { headers: { "Content-Type": "application/json" } });
        }

        const { data: users } = await supabaseAdmin
          .from("profiles")
          .select("id, email, display_name, first_name")
          .in("id", eligibleIds);
        const usersById = new Map<string, any>((users ?? []).map((u: any) => [u.id, u]));

        const { data: trades } = await supabaseAdmin
          .from("paper_trades")
          .select("user_id, pnl, symbol")
          .in("user_id", eligibleIds)
          .eq("status", "closed")
          .gte("closed_at", since);

        const byUser = new Map<string, Array<{ pnl: number | null; symbol: string | null }>>();
        for (const t of (trades ?? []) as any[]) {
          if (!byUser.has(t.user_id)) byUser.set(t.user_id, []);
          byUser.get(t.user_id)!.push(t);
        }

        let enqueued = 0;
        for (const [userId, list] of byUser.entries()) {
          if (list.length === 0) continue;
          const user = usersById.get(userId);
          if (!user?.email) continue;
          const wins = list.filter((t) => (t.pnl ?? 0) > 0).length;
          const netPnl = list.reduce((s, t) => s + (t.pnl ?? 0), 0);
          const sorted = [...list].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
          await triggerMonthlyReport(
            { email: user.email, userId, name: user.first_name ?? user.display_name },
            {
              periodLabel,
              trades: list.length,
              winRate: `${Math.round((wins / list.length) * 100)}%`,
              netPnl: fmtMoney(netPnl),
              bestTrade: sorted[0] ? `${sorted[0].symbol ?? "—"} ${fmtMoney(sorted[0].pnl ?? 0)}` : "—",
              worstTrade: sorted[sorted.length - 1]
                ? `${sorted[sorted.length - 1].symbol ?? "—"} ${fmtMoney(sorted[sorted.length - 1].pnl ?? 0)}`
                : "—",
            },
          );
          enqueued++;
        }

        return new Response(JSON.stringify({ ok: true, enqueued }), { headers: { "Content-Type": "application/json" } });
      }),
    },
  },
});
