import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, TrendingDown, TrendingUp, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getAccountStats, listTrades } from "@/lib/paper-trading.functions";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import {
  accountRiskLimits,
  computeAccountRisk,
  formatMarginLevel,
  formatMarginRatio,
  type OpenTradeInput,
} from "@/lib/paper-trading/risk";
import { cn } from "@/lib/utils";
import { usePaper } from "./context";

export function AccountSummary() {
  const { account, accountId, loading } = usePaper();
  const quotes = useLiveQuotes();
  const fetchOpen = useServerFn(listTrades);
  const fetchStats = useServerFn(getAccountStats);

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetchOpen({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTradeInput[]>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ["paper", "stats", accountId],
    queryFn: () => fetchStats({ data: { account_id: accountId! } }),
    enabled: !!accountId,
  });

  const risk = useMemo(() => {
    if (!account) return null;
    return computeAccountRisk(
      account,
      openTrades ?? [],
      (sym) => quotes[sym]?.price ?? null,
      accountRiskLimits(account as any),
    );
  }, [account, openTrades, quotes]);

  if (!account) {
    if (loading) {
      return (
        <GlassCard className="p-4">
          <Skeleton className="h-6 w-32 mb-3" />
          <Skeleton className="h-8 w-40" />
        </GlassCard>
      );
    }
    return (
      <GlassCard className="p-4">
        <p className="text-sm font-semibold">No paper account yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Open the account switcher above to create your first paper trading account.
        </p>
      </GlassCard>
    );
  }

  const equity = risk?.equity ?? Number(account.balance);
  const floating = risk?.floatingPnl ?? 0;
  const used = risk?.usedMargin ?? 0;
  const free = risk?.freeMargin ?? equity;
  const marginLevel = risk?.marginLevel ?? null;
  const buyingPower = risk?.buyingPower ?? equity * Number(account.leverage ?? 1);
  const marginRatio = risk?.marginRatio ?? 0;

  const marginTone =
    risk?.status === "stop_out" ? "text-danger"
    : risk?.status === "margin_call" ? "text-danger"
    : risk?.status === "warning" ? "text-warning"
    : "text-success";

  return (
    <GlassCard className="p-4">
      {risk?.status === "margin_call" && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          <AlertTriangle className="h-4 w-4" />
          Margin call — equity is at risk. Margin level {formatMarginLevel(marginLevel)} ≤ {Number(account.margin_call_level ?? 100)}%.
          Add funds or close losing positions.
        </div>
      )}
      {risk?.status === "stop_out" && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-danger/60 bg-danger/20 px-3 py-2 text-xs font-semibold text-danger">
          <ShieldAlert className="h-4 w-4" />
          Stop-out triggered — closing worst losers automatically until margin level recovers above {Number(account.stop_out_level ?? 50)}%.
        </div>
      )}
      {/* Mobile: horizontal snap-scroll KPI ribbon.
          Desktop (sm+): original responsive grid. */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:hidden sm:px-0">
        <Stat mobile label="Balance" value={formatCurrency(Number(account.balance), account.currency)} />
        <Stat mobile label="Equity" value={formatCurrency(equity, account.currency)} accent />
        <Stat mobile label="Floating P/L" value={
          <span className={floating >= 0 ? "text-success" : "text-danger"}>
            {floating >= 0 ? "+" : ""}{formatCurrency(floating, account.currency)}
          </span>
        } />
        <Stat mobile label="Used margin" value={formatCurrency(used, account.currency)} />
        <Stat mobile label="Free margin" value={formatCurrency(free, account.currency)} />
        <Stat mobile label="Margin level" value={
          <span className={cn("flex items-center gap-1", marginTone)}>{formatMarginLevel(marginLevel)}</span>
        } />
        <Stat mobile label="Buying power" value={formatCurrency(buyingPower, account.currency)} />
        <Stat mobile label="Margin ratio" value={formatMarginRatio(marginRatio)} />
        <Stat mobile label="Win rate" value={`${Number(stats?.win_rate ?? 0).toFixed(1)}%`} />
        <Stat mobile label="Net P/L" value={
          <span className={Number(stats?.net_pnl ?? 0) >= 0 ? "text-success" : "text-danger"}>
            {formatCurrency(Number(stats?.net_pnl ?? 0), account.currency)}
          </span>
        } />
      </div>
      <div className="hidden grid-cols-2 gap-3 sm:grid md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Balance" value={formatCurrency(Number(account.balance), account.currency)} />
        <Stat label="Equity" value={formatCurrency(equity, account.currency)} accent />
        <Stat label="Floating P/L" value={
          <span className={floating >= 0 ? "text-success" : "text-danger"}>
            {floating >= 0 ? "+" : ""}{formatCurrency(floating, account.currency)}
          </span>
        } icon={floating >= 0 ? <TrendingUp className="h-3.5 w-3.5"/> : <TrendingDown className="h-3.5 w-3.5"/>} />
        <Stat label="Used margin" value={formatCurrency(used, account.currency)} />
        <Stat label="Free margin" value={formatCurrency(free, account.currency)} />
        <Stat label="Margin level" value={
          <span className={cn("flex items-center gap-1", marginTone)}>
            {formatMarginLevel(marginLevel)}
            {risk?.status && risk.status !== "safe" && (
              <Badge variant="outline" className={cn("h-4 px-1 text-[9px] uppercase", marginTone)}>
                {risk.status.replace("_", " ")}
              </Badge>
            )}
          </span>
        } />
        <Stat label="Buying power" value={formatCurrency(buyingPower, account.currency)} />
        <Stat label="Margin ratio" value={formatMarginRatio(marginRatio)} />
        <Stat label="Win rate" value={`${Number(stats?.win_rate ?? 0).toFixed(1)}%`} />
        <Stat label="Net P/L" value={
          <span className={Number(stats?.net_pnl ?? 0) >= 0 ? "text-success" : "text-danger"}>
            {formatCurrency(Number(stats?.net_pnl ?? 0), account.currency)}
          </span>
        } />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Trades: <AnimatedCounter value={Number(stats?.total_trades ?? 0)} /></span>
        <span>·</span>
        <span>Margin call at {Number(account.margin_call_level ?? 100)}%</span>
        <span>·</span>
        <span>Stop-out at {Number(account.stop_out_level ?? 50)}%</span>
        {account.negative_balance_protection && (<><span>·</span><span>Negative balance protection ON</span></>)}
      </div>
    </GlassCard>
  );
}

function Stat({ label, value, icon, accent, mobile }: { label: string; value: React.ReactNode; icon?: React.ReactNode; accent?: boolean; mobile?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        "min-w-0",
        mobile && "min-w-[112px] shrink-0 snap-start rounded-md border border-border/60 bg-card/60 p-2.5",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className={cn(
        "mt-1 flex items-center gap-1 truncate font-semibold tabular-nums",
        mobile ? "font-mono text-[13px]" : "text-base",
        accent && "text-primary",
      )}>
        {icon}{value}
      </div>
    </motion.div>
  );
}
