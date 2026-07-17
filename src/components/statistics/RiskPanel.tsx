import { useMemo } from "react";
import { AlertTriangle, ShieldCheck, Target } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "./context";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { closedOnly, computeKpis } from "@/lib/statistics/calculations";
import { cn } from "@/lib/utils";

export function RiskPanel() {
  const { filtered, accounts, filters } = useStatistics();
  const list = closedOnly(filtered);
  const k = computeKpis(list);

  const stats = useMemo(() => {
    const risks: number[] = [];
    const lots: number[] = [];
    const sls: number[] = [];
    const tps: number[] = [];
    let overRisked = 0;
    for (const t of list) {
      if (t.risk_pct != null) {
        risks.push(Number(t.risk_pct));
        if (Number(t.risk_pct) > 2) overRisked++;
      }
      if (t.lot_size != null) lots.push(Number(t.lot_size));
      if (t.stop_loss != null && t.entry_price != null) sls.push(Math.abs(Number(t.entry_price) - Number(t.stop_loss)));
      if (t.take_profit != null && t.entry_price != null) tps.push(Math.abs(Number(t.entry_price) - Number(t.take_profit)));
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      avgRisk: avg(risks),
      avgLot: avg(lots),
      avgSL: avg(sls),
      avgTP: avg(tps),
      overRisked,
    };
  }, [list]);

  const activeAccount = filters.accounts.length === 1
    ? accounts.find((a) => a.id === filters.accounts[0])
    : null;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card icon={ShieldCheck} title="Risk exposure">
        <Row k="Average risk %" v={stats.avgRisk ? `${fmtNumber(stats.avgRisk)}%` : "—"} />
        <Row k="Average position size" v={stats.avgLot ? fmtNumber(stats.avgLot, 2) : "—"} />
        <Row k="Over-risked trades (>2%)" v={String(stats.overRisked)} tone={stats.overRisked > 0 ? "down" : "up"} />
      </Card>
      <Card icon={Target} title="Trade geometry">
        <Row k="Average SL distance" v={stats.avgSL ? fmtNumber(stats.avgSL, 5) : "—"} />
        <Row k="Average TP distance" v={stats.avgTP ? fmtNumber(stats.avgTP, 5) : "—"} />
        <Row k="Average RR" v={`${fmtNumber(k.avgRR)}R`} />
      </Card>
      <Card icon={AlertTriangle} title="Drawdown">
        <Row k="Max drawdown" v={fmtCurrency(k.maxDrawdown)} tone="down" />
        <Row k="Max drawdown %" v={fmtPercent(k.maxDrawdownPct)} tone="down" />
        <Row k="Current drawdown" v={fmtCurrency(k.currentDrawdown)} tone={k.currentDrawdown > 0 ? "down" : "up"} />
        {activeAccount ? <Row k="Balance" v={fmtCurrency(Number(activeAccount.balance))} /> : null}
      </Card>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </GlassCard>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("font-bold tabular-nums", tone === "up" && "text-emerald-400", tone === "down" && "text-rose-400")}>{v}</span>
    </div>
  );
}

export function AccountComparison() {
  const { raw, accounts } = useStatistics();
  const rows = useMemo(() => {
    return accounts.map((a) => {
      const trades = raw.filter((t) => t.account_id === a.id && t.closed_at);
      const k = computeKpis(trades);
      return { account: a, k };
    }).filter((r) => r.k.totalTrades > 0);
  }, [raw, accounts]);

  if (accounts.length < 2) return null;
  return (
    <GlassCard className="p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Account comparison</div>
      {rows.length === 0 ? (
        <div className="grid h-24 place-items-center text-xs text-muted-foreground">No account activity to compare.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ account, k }) => (
            <div key={account.id} className="rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">{account.name}</div>
                <span className={cn("text-xs tabular-nums", k.netProfit >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtCurrency(k.netProfit)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Mini k="Balance" v={fmtCurrency(Number(account.balance))} />
                <Mini k="Drawdown" v={fmtCurrency(k.maxDrawdown)} />
                <Mini k="Win rate" v={fmtPercent(k.winRate)} />
                <Mini k="Avg RR" v={`${fmtNumber(k.avgRR)}R`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}
