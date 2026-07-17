import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { listReplayTrades } from "@/lib/replay.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/trades")({
  component: TradesPage,
});

function TradesPage() {
  const list = useServerFn(listReplayTrades);
  const q = useQuery({ queryKey: ["replay", "trades"], queryFn: () => list() });
  const rows = (q.data ?? []) as any[];

  return (
    <div className="space-y-4">
      <PageHeader title="Replay Trades" description="Every trade you've taken inside a replay session." />
      <GlassCard className="p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Session</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Lot</th>
              <th className="px-3 py-2 text-right">RR</th>
              <th className="px-3 py-2 text-right">PnL</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border/40 hover:bg-background/30">
                <td className="px-3 py-2">
                  <Link to="/replay/session" search={{ id: t.session_id } as any} className="text-primary hover:underline">
                    {t.replay_sessions?.title ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2">{t.symbol}</td>
                <td className={cn("px-3 py-2 uppercase", t.direction === "long" ? "text-emerald-400" : "text-rose-400")}>{t.direction}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(t.entry_price).toFixed(4)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.exit_price != null ? Number(t.exit_price).toFixed(4) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.lot_size}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.rr_realized != null ? Number(t.rr_realized).toFixed(2) : "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", (t.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {t.pnl != null ? Number(t.pnl).toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{t.status}</td>
              </tr>
            ))}
            {rows.length === 0 && !q.isPending ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No replay trades yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
