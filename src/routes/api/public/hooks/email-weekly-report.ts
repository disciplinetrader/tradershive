/**
 * Cron: enqueue weekly performance reports.
 * Recommended schedule: Monday 09:00 UTC.
 *
 * Aggregates the previous 7 days of paper trades per user, then enqueues
 * `weekly_report` for anyone whose preference allows it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
}

interface TradeRow {
  user_id: string;
  pnl: number | null;
  symbol: string | null;
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export const Route = createFileRoute("/api/public/hooks/email-weekly-report")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/email-weekly-report", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { triggerWeeklyReport } = await import("@/lib/email/triggers.server");

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const periodLabel = `${new Date(since).toISOString().slice(0, 10)} → ${new Date().toISOString().slice(0, 10)}`;

        const { data: prefs } = await supabaseAdmin
          .from("email_preferences")
          .select("user_id")
          .eq("master_enabled", true)
          .eq("weekly_report", true);
        const eligibleIds = (prefs ?? []).map((r: { user_id: string }) => r.user_id);
        if (eligibleIds.length === 0) {
          return new Response(JSON.stringify({ ok: true, enqueued: 0 }), { headers: { "Content-Type": "application/json" } });
        }

        const { data: users } = await supabaseAdmin
          .from("profiles")
          .select("id, email, display_name, first_name")
          .in("id", eligibleIds);
        const usersById = new Map<string, UserRow>((users ?? []).map((u: any) => [u.id, u]));

        const { data: trades } = await supabaseAdmin
          .from("paper_trades")
          .select("user_id, pnl, symbol")
          .in("user_id", eligibleIds)
          .eq("status", "closed")
          .gte("closed_at", since);

        const byUser = new Map<string, TradeRow[]>();
        for (const t of ((trades ?? []) as TradeRow[])) {
          if (!byUser.has(t.user_id)) byUser.set(t.user_id, []);
          byUser.get(t.user_id)!.push(t);
        }

        let enqueued = 0;
        for (const [userId, list] of byUser.entries()) {
          if (list.length === 0) continue;
          const user = usersById.get(userId);
          if (!user?.email) continue;
          const wins = list.filter((t) => (t.pnl ?? 0) > 0).length;
          const winRate = list.length ? `${Math.round((wins / list.length) * 100)}%` : "—";
          const netPnl = list.reduce((s, t) => s + (t.pnl ?? 0), 0);
          const sorted = [...list].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
          const best = sorted[0];
          const worst = sorted[sorted.length - 1];
          await triggerWeeklyReport(
            { email: user.email, userId, name: user.first_name ?? user.display_name },
            {
              periodLabel,
              trades: list.length,
              winRate,
              netPnl: fmtMoney(netPnl),
              bestTrade: best ? `${best.symbol ?? "—"} ${fmtMoney(best.pnl ?? 0)}` : "—",
              worstTrade: worst ? `${worst.symbol ?? "—"} ${fmtMoney(worst.pnl ?? 0)}` : "—",
            },
          );
          enqueued++;
        }

        return new Response(JSON.stringify({ ok: true, enqueued, eligible: eligibleIds.length }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
