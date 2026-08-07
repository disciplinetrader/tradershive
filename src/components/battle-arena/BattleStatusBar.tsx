import { usePaper } from "@/components/paper-trading/context";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import { Wallet, Target, Activity, Bell, Maximize2, Lock, Unlock, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { emitTradeIntent } from "@/lib/trading/trade-intent";

export function BattleStatusBar() {
  const { account, symbol } = usePaper();
  const [lot, setLot] = useState("0.10");
  const [isLocked, setIsLocked] = useState(false);
  const [isAlertOn, setIsAlertOn] = useState(false);
  
  if (!account) return null;

  const realizedPnl = Number(account.balance) - Number(account.starting_balance);
  const unrealizedPnl = Number(account.equity) - Number(account.balance);
  const totalPnl = Number(account.equity) - Number(account.starting_balance);
  const pnlPct = (totalPnl / Number(account.starting_balance)) * 100;

  const handleTrade = (side: "long" | "short") => {
    emitTradeIntent({
      kind: "submit",
      side,
      orderType: "market",
      lot: Number(lot),
    });
  };

  const adjustLot = (delta: number) => {
    if (isLocked) return;
    const current = parseFloat(lot) || 0;
    setLot(Math.max(0.01, current + delta).toFixed(2));
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <div className="h-14 border-t border-border/40 bg-background/95 backdrop-blur-md px-4 flex items-center justify-between z-50">
      {/* Left side: Order Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 overflow-hidden rounded-xl border border-border/40 bg-card/40 p-1">
          <Button
            onClick={() => handleTrade("long")}
            size="sm"
            className="h-9 px-4 bg-success hover:bg-success/90 text-success-foreground font-black uppercase text-xs"
          >
            <TrendingUp className="mr-2 h-3.5 w-3.5" />
            Buy
          </Button>
          <Button
            onClick={() => handleTrade("short")}
            size="sm"
            className="h-9 px-4 bg-danger hover:bg-danger/90 text-danger-foreground font-black uppercase text-xs"
          >
            <TrendingDown className="mr-2 h-3.5 w-3.5" />
            Sell
          </Button>
        </div>

        <div className="flex items-center gap-1 bg-card/40 rounded-xl border border-border/40 px-1 overflow-hidden h-10">
          <button 
            disabled={isLocked}
            onClick={() => adjustLot(-0.01)}
            className="h-8 w-6 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 transition-colors text-sm font-bold"
          >
            -
          </button>
          <Input 
            value={lot}
            onChange={(e) => !isLocked && setLot(e.target.value)}
            disabled={isLocked}
            className="h-8 w-14 border-none bg-transparent text-center font-mono font-bold text-xs focus-visible:ring-0 p-0"
          />
          <button 
            disabled={isLocked}
            onClick={() => adjustLot(0.01)}
            className="h-8 w-6 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 transition-colors text-sm font-bold"
          >
            +
          </button>
        </div>

        <button 
          onClick={() => setIsAlertOn(!isAlertOn)}
          className={cn(
            "h-10 w-10 flex items-center justify-center rounded-xl border border-border/40 bg-card/40 transition-colors",
            isAlertOn ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bell className={cn("h-4 w-4", isAlertOn && "fill-current")} />
        </button>
      </div>

      {/* Middle side: Account Stats (Right Aligned in parity with FX Replay reference) */}
      <div className="flex items-center gap-6 ml-auto mr-4">
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Balance</span>
          <span className="text-sm font-mono font-bold">{formatCurrency(Number(account.balance), account.currency)}</span>
        </div>

        <div className="h-6 w-[1px] bg-border/40" />

        <div className="flex flex-col items-end">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Realized P/L</span>
          <span className={cn(
            "text-sm font-mono font-bold",
            realizedPnl >= 0 ? "text-success" : "text-danger"
          )}>
            {realizedPnl >= 0 ? "+" : ""}{formatCurrency(realizedPnl, account.currency)}
          </span>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Unrealized P/L</span>
          <div className="flex items-center gap-1.5">
             <span className={cn(
              "text-sm font-mono font-bold",
              unrealizedPnl >= 0 ? "text-success" : "text-danger"
            )}>
              {unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(unrealizedPnl, account.currency)}
            </span>
            <span className={cn(
              "text-[9px] font-mono font-bold",
              totalPnl >= 0 ? "text-success/60" : "text-danger/60"
            )}>
              ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <button 
          onClick={toggleFullscreen}
          className="h-10 w-10 flex items-center justify-center rounded-xl border border-border/40 bg-card/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}