/**
 * Compact Today's PnL bar for the Trading Workspace header.
 * Reads today's closed trades + open floating PnL from the current
 * account and renders profit, loss, open PnL, drawdown %, and target %.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingDown, TrendingUp, Target, ShieldAlert } from "lucide-react";
import { listTrades } from "@/lib/paper-trading.functions";
import { usePaper } from "@/components/paper-trading/context";
import { useLivePrice } from "@/lib/paper-trading/mock-prices";
import { floatingPnl } from "@/lib/trading/plan-math";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { cn } from "@/lib/utils";

type Trade = {
  id: string; symbol: string; direction: "long" | "short";
  entry_price: number; lot_size: number; pnl: number | null;
  status: "open" | "closed" | "cancelled"; closed_at: string | null; opened_at: string;
};

interface Props {
  dailyTargetPct?: number;
  dailyLossLimitPct?: number;
}

export function TodayPnLWidget({ dailyTargetPct = 5, dailyLossLimitPct = 5 }: Props) {
  const { accountId, account, symbol } = usePaper();
  const fetchTrades = useServerFn(listTrades);
  const live = useLivePrice(symbol);

  const { data: trades } = useQuery({
    queryKey: ["paper", "trades", accountId, "today"],
    queryFn: () => fetchTrades({ data: { account_id: accountId! } }) as unknown as Promise<Trade[]>,
    enabled: !!accountId,
    refetchInterval: 6000,
  });

  const stats = useMemo(() => {
    if (!trades) return { profit: 0, loss: 0, open: 0, net: 0, count: 0 };
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const today0 = startOfDay.getTime();
    let profit = 0, loss = 0, open = 0, count = 0;
    for (const t of trades) {
      if (t.status === "closed" && t.closed_at && new Date(t.closed_at).getTime() >= today0) {
        const pnl = Number(t.pnl ?? 0);
        if (pnl >= 0) profit += pnl; else loss += Math.abs(pnl);
        count++;
      } else if (t.status === "open") {
        const sym = findSymbol(t.symbol);
        if (sym) {
          const px = t.symbol === symbol ? live ?? sym.refPrice : sym.refPrice;
          open += floatingPnl(sym, t.direction, Number(t.entry_price), px, Number(t.lot_size));
        }
      }
    }
    return { profit, loss, open, net: profit - loss + open, count };
  }, [trades, symbol, live]);

  const balance = account?.starting_balance ?? 10000;
  const target = (balance * dailyTargetPct) / 100;
  const loss = (balance * dailyLossLimitPct) / 100;
  const targetPct = target > 0 ? Math.min(100, Math.max(0, (stats.net / target) * 100)) : 0;
  const lossPct = loss > 0 ? Math.min(100, Math.max(0, (stats.loss / loss) * 100)) : 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
      <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Profit" value={`+$${stats.profit.toFixed(2)}`} tone="green" />
      <Metric icon={<TrendingDown className="h-3.5 w-3.5" />} label="Loss" value={`-$${stats.loss.toFixed(2)}`} tone="red" />
      <Metric label="Open" value={`${stats.open >= 0 ? "+" : ""}$${stats.open.toFixed(2)}`} tone={stats.open >= 0 ? "green" : "red"} />
      <Metric label="Net" value={`${stats.net >= 0 ? "+" : ""}$${stats.net.toFixed(2)}`} tone={stats.net >= 0 ? "green" : "red"} strong />
      <Metric label="Trades" value={String(stats.count)} />
      <div className="ml-auto flex items-center gap-3">
        <Progress icon={<Target className="h-3 w-3 text-primary" />} label="Target" pct={targetPct} tone="primary" />
        <Progress icon={<ShieldAlert className="h-3 w-3 text-danger" />} label="Loss" pct={lossPct} tone="rose" />
      </div>
    </div>
  );
}

function Metric({ icon, label, value, tone, strong }: { icon?: React.ReactNode; label: string; value: string; tone?: "green" | "red"; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono tabular-nums",
        strong ? "text-sm font-bold" : "font-semibold",
        tone === "green" && "text-success",
        tone === "red" && "text-danger",
      )}>{value}</span>
    </div>
  );
}

function Progress({ icon, label, pct, tone }: { icon: React.ReactNode; label: string; pct: number; tone: "primary" | "rose" }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 left-0", tone === "primary" ? "bg-primary" : "bg-danger")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[10px] font-semibold">{pct.toFixed(0)}%</span>
    </div>
  );
}
