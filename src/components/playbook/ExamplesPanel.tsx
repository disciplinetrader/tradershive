import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Award, Skull, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatHold } from "@/lib/playbook/stats";
import type { PlaybookStats, PlaybookTradeExample } from "@/lib/playbook/types";

export function ExamplesPanel({ stats }: { stats: PlaybookStats }) {
  if (stats.trades === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
        <TrendingUp className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">No trades linked yet</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Attach this playbook to trades in Paper Trading or Journal to see performance.
        </p>
      </div>
    );
  }

  const wr = Math.round(stats.win_rate * 100);
  const avgR = stats.avg_r;
  const pfDisplay = Number.isFinite(stats.profit_factor) ? stats.profit_factor.toFixed(2) : "∞";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Trades" value={String(stats.trades)} />
        <Kpi label="Win rate" value={`${wr}%`} tone={wr >= 50 ? "up" : "down"} />
        <Kpi label="Avg R" value={`${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`} tone={avgR >= 0 ? "up" : "down"} />
        <Kpi label="Profit factor" value={pfDisplay} tone={stats.profit_factor >= 1 ? "up" : "down"} />
        <Kpi label="Avg hold" value={formatHold(stats.avg_hold_seconds)} />
        <Kpi label="W · L · BE" value={`${stats.wins} · ${stats.losses} · ${stats.breakevens}`} />
      </div>

      {(stats.best || stats.worst) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {stats.best ? (
            <HighlightCard tone="up" icon={<Award className="h-4 w-4" />} title="Best example" trade={stats.best} />
          ) : null}
          {stats.worst ? (
            <HighlightCard tone="down" icon={<Skull className="h-4 w-4" />} title="Worst example" trade={stats.worst} />
          ) : null}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Side</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-left">Closed</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {stats.examples.slice(0, 25).map((t) => (
              <tr key={`${t.source}-${t.id}`} className="border-t border-border/40 transition hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">{t.symbol ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {t.side ? (
                    <Badge variant="outline" className={cn("text-[10px]", t.side.toLowerCase() === "buy" || t.side.toLowerCase() === "long" ? "text-success" : "text-destructive")}>
                      {t.side.toUpperCase()}
                    </Badge>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t.source}</td>
                <td className={cn("px-3 py-2 text-right font-mono tabular-nums text-xs", t.outcome === "win" && "text-success", t.outcome === "loss" && "text-destructive")}>
                  {t.r_multiple == null ? "—" : `${t.r_multiple >= 0 ? "+" : ""}${t.r_multiple.toFixed(2)}R`}
                </td>
                <td className={cn("px-3 py-2 text-right font-mono tabular-nums text-xs", (t.pnl ?? 0) > 0 && "text-success", (t.pnl ?? 0) < 0 && "text-destructive")}>
                  {t.pnl == null ? "—" : t.pnl.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {t.closed_at ? new Date(t.closed_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <TradeLink trade={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 font-mono text-base font-semibold tabular-nums",
        tone === "up" && "text-success",
        tone === "down" && "text-destructive",
      )}>
        {value}
      </div>
    </div>
  );
}

function HighlightCard({ tone, icon, title, trade }: { tone: "up" | "down"; icon: React.ReactNode; title: string; trade: PlaybookTradeExample }) {
  return (
    <div className={cn(
      "rounded-xl border p-4",
      tone === "up" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
    )}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
        <span className={tone === "up" ? "text-success" : "text-destructive"}>{icon}</span>
        {title}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-sm">{trade.symbol ?? "—"}</span>
        {trade.side ? <Badge variant="outline" className="text-[10px]">{trade.side.toUpperCase()}</Badge> : null}
        <span className={cn("ml-auto font-mono text-lg font-semibold tabular-nums", tone === "up" ? "text-success" : "text-destructive")}>
          {trade.r_multiple != null ? `${trade.r_multiple >= 0 ? "+" : ""}${trade.r_multiple.toFixed(2)}R` : trade.pnl?.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{trade.closed_at ? new Date(trade.closed_at).toLocaleString() : ""}</span>
        <TradeLink trade={trade} />
      </div>
    </div>
  );
}

function TradeLink({ trade }: { trade: PlaybookTradeExample }) {
  if (trade.source === "journal") {
    return (
      <Link
        to="/journal/$entryId"
        params={{ entryId: trade.id }}
        className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
      >
        Open <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <Link
      to="/trades/$tradeId"
      params={{ tradeId: trade.id }}
      className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
    >
      Open <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}
