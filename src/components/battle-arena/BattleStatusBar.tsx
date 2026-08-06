import { usePaper } from "@/components/paper-trading/context";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BattleStatusBar() {
  const { account } = usePaper();
  
  if (!account) return null;

  const realizedPnl = Number(account.balance) - Number(account.starting_balance);
  const unrealizedPnl = Number(account.equity) - Number(account.balance);
  const totalPnl = Number(account.equity) - Number(account.starting_balance);
  const pnlPct = (totalPnl / Number(account.starting_balance)) * 100;

  return (
    <div className="h-10 border-t border-border/40 bg-background/80 backdrop-blur-md px-6 flex items-center justify-between z-40">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Balance</span>
          <span className="text-sm font-mono font-bold">{formatCurrency(Number(account.balance), account.currency)}</span>
        </div>

        <div className="h-4 w-[1px] bg-border/40" />

        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Equity</span>
          <span className="text-sm font-mono font-bold text-primary">{formatCurrency(Number(account.equity), account.currency)}</span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Realized P/L</span>
          <span className={cn(
            "text-sm font-mono font-bold transition-colors",
            realizedPnl >= 0 ? "text-success" : "text-danger"
          )}>
            {realizedPnl >= 0 ? "+" : ""}{formatCurrency(realizedPnl, account.currency)}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Floating P/L</span>
          <div className="flex items-center gap-1.5">
             <span className={cn(
              "text-sm font-mono font-bold transition-colors",
              unrealizedPnl >= 0 ? "text-success" : "text-danger"
            )}>
              {unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(unrealizedPnl, account.currency)}
            </span>
            <span className={cn(
              "text-[10px] font-mono font-bold",
              totalPnl >= 0 ? "text-success/60" : "text-danger/60"
            )}>
              ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-border/40" />

        <div className="flex items-center gap-2.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Starting</span>
          <span className="text-sm font-mono font-bold text-muted-foreground/80">{formatCurrency(Number(account.starting_balance), account.currency)}</span>
        </div>
      </div>
    </div>
  );
}
