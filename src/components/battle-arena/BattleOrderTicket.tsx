import { useState } from "react";
import { usePaper } from "@/components/paper-trading/context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { emitTradeIntent } from "@/lib/trading/trade-intent";

export function BattleOrderTicket() {
  const { symbol, account } = usePaper();
  const [lot, setLot] = useState("0.10");
  const [isLocked, setIsLocked] = useState(true);

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

  return (
    <div className="absolute bottom-6 left-6 z-40 flex flex-col gap-2 p-3 rounded-2xl border border-border/40 bg-background/80 backdrop-blur-xl shadow-2xl w-[260px] animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Ticket</span>
        <button 
          onClick={() => setIsLocked(!isLocked)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 text-primary" />}
        </button>
      </div>

      <div className="flex items-center gap-1.5 h-10 bg-card/40 rounded-xl border border-border/40 px-1 overflow-hidden">
        <button 
          disabled={isLocked}
          onClick={() => adjustLot(-0.01)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 transition-colors text-lg font-bold"
        >
          -
        </button>
        <Input 
          value={lot}
          onChange={(e) => !isLocked && setLot(e.target.value)}
          disabled={isLocked}
          className="h-8 border-none bg-transparent text-center font-mono font-bold text-sm focus-visible:ring-0"
        />
        <button 
          disabled={isLocked}
          onClick={() => adjustLot(0.01)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 transition-colors text-lg font-bold"
        >
          +
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => handleTrade("long")}
          className="h-11 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-black uppercase tracking-tight shadow-lg shadow-success/20 group"
        >
          <TrendingUp className="mr-2 h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
          Buy
        </Button>
        <Button
          onClick={() => handleTrade("short")}
          className="h-11 rounded-xl bg-danger hover:bg-danger/90 text-danger-foreground font-black uppercase tracking-tight shadow-lg shadow-danger/20 group"
        >
          <TrendingDown className="mr-2 h-4 w-4 transition-transform group-hover:translate-y-0.5" />
          Sell
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 mt-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Lot Size</span>
        <div className="h-1 w-1 rounded-full bg-border/60" />
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{symbol}</span>
      </div>
    </div>
  );
}
