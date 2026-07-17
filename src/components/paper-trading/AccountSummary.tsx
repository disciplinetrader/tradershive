import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccountStats, listTrades } from "@/lib/paper-trading.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { pnl as computePnl, formatCurrency } from "@/lib/paper-trading/calculations";
import { useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import { usePaper } from "./context";

export function AccountSummary() {
  const { account, accountId } = usePaper();
  const quotes = useLiveQuotes();
  const fetchOpen = useServerFn(listTrades);
  const fetchStats = useServerFn(getAccountStats);

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetchOpen({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<Array<Record<string, unknown>>>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ["paper", "stats", accountId],
    queryFn: () => fetchStats({ data: { account_id: accountId! } }),
    enabled: !!accountId,
  });

  const floating = useMemo(() => {
    if (!openTrades) return 0;
    let total = 0;
    for (const t of openTrades) {
      const sym = findSymbol(String(t.symbol));
      if (!sym) continue;
      const p = quotes[String(t.symbol)]?.price ?? sym.refPrice;
      total += computePnl(sym, t.direction as "long"|"short", Number(t.entry_price), p, Number(t.lot_size));
    }
    return total;
  }, [openTrades, quotes]);

  if (!account) {
    return (
      <GlassCard className="p-4">
        <Skeleton className="h-6 w-32 mb-3" />
        <Skeleton className="h-8 w-40" />
      </GlassCard>
    );
  }

  const equity = Number(account.balance) + floating;
  const used = openTrades?.length ? equity * 0.05 : 0; // heuristic display
  const free = equity - used;

  return (
    <GlassCard className="p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Balance" value={formatCurrency(Number(account.balance), account.currency)} />
        <Stat label="Equity" value={formatCurrency(equity, account.currency)} accent />
        <Stat label="Floating P/L" value={
          <span className={floating >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {floating >= 0 ? "+" : ""}{formatCurrency(floating, account.currency)}
          </span>
        } icon={floating >= 0 ? <TrendingUp className="h-3.5 w-3.5"/> : <TrendingDown className="h-3.5 w-3.5"/>} />
        <Stat label="Free margin" value={formatCurrency(free, account.currency)} />
        <Stat label="Win rate" value={`${Number(stats?.win_rate ?? 0).toFixed(1)}%`} />
        <Stat label="Total trades" value={<AnimatedCounter value={Number(stats?.total_trades ?? 0)} />} />
        <Stat label="Net P/L" value={
          <span className={Number(stats?.net_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {formatCurrency(Number(stats?.net_pnl ?? 0), account.currency)}
          </span>
        } />
      </div>
    </GlassCard>
  );
}

function Stat({ label, value, icon, accent }: { label: string; value: React.ReactNode; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={"mt-1 flex items-center gap-1 truncate text-base font-semibold tabular-nums " + (accent ? "text-primary" : "")}>
        {icon}{value}
      </p>
    </motion.div>
  );
}
