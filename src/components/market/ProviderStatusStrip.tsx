import { useEffect, useState } from "react";
import { marketData } from "@/lib/market-data/engine";
import type { ProviderStatus } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, AlertCircle, MinusCircle } from "lucide-react";

const ICONS: Record<ProviderStatus, typeof Wifi> = {
  connected: Wifi, disconnected: WifiOff, connecting: Loader2, error: AlertCircle, disabled: MinusCircle,
};
const COLORS: Record<ProviderStatus, string> = {
  connected: "text-emerald-400", disconnected: "text-muted-foreground",
  connecting: "text-amber-400", error: "text-rose-400", disabled: "text-muted-foreground/60",
};

export function ProviderStatusStrip({ className }: { className?: string }) {
  const [rows, setRows] = useState(() => marketData.health());
  useEffect(() => {
    marketData.init();
    const tick = () => setRows(marketData.health());
    tick(); const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {rows.map((r) => {
        const Icon = ICONS[r.status];
        return (
          <div key={r.code} className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1 text-[11px]",
            COLORS[r.status],
          )}>
            <Icon className={cn("h-3 w-3", r.status === "connecting" && "animate-spin")} />
            <span className="font-medium">{r.name}</span>
            <span className="text-[10px] uppercase opacity-70">{r.status}</span>
          </div>
        );
      })}
    </div>
  );
}
