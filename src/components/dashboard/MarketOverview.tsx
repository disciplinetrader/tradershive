import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MOCK_MARKETS } from "@/lib/dashboard-mock";
import { cn } from "@/lib/utils";

export function MarketOverview() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Demo data</Badge>
        <span className="text-xs text-muted-foreground">Live feed connects when APIs are wired.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {MOCK_MARKETS.slice(0, 9).map((m) => {
          const up = m.change >= 0;
          return (
            <div
              key={m.symbol}
              className="glass flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:-translate-y-0.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{m.symbol}</div>
                <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.market}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm tabular-nums">{m.price.toLocaleString()}</div>
                <div
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-medium",
                    up ? "text-primary" : "text-danger",
                  )}
                >
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {up ? "+" : ""}
                  {m.change.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
