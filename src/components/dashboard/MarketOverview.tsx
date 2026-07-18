import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useLiveQuote } from "@/lib/market-data/hooks";
import type { MarketKind } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

const MARKETS: { symbol: string; market: MarketKind }[] = [
  { symbol: "EUR/USD", market: "forex" },
  { symbol: "GBP/USD", market: "forex" },
  { symbol: "USD/JPY", market: "forex" },
  { symbol: "BTC/USDT", market: "crypto" },
  { symbol: "ETH/USDT", market: "crypto" },
  { symbol: "SOL/USDT", market: "crypto" },
  { symbol: "XAU/USD", market: "metal" },
  { symbol: "NAS100", market: "indices" },
  { symbol: "SPX500", market: "indices" },
];

function MarketTile({ symbol, market }: { symbol: string; market: MarketKind }) {
  const q = useLiveQuote(symbol, market);
  const change = q?.changePct ?? 0;
  const up = change >= 0;
  return (
    <div className="glass flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:-translate-y-0.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{symbol}</div>
        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{market}</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm tabular-nums">{q?.last?.toLocaleString() ?? "…"}</div>
        <div className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-primary" : "text-danger")}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {up ? "+" : ""}{change.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

export function MarketOverview() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {MARKETS.map((m) => <MarketTile key={m.symbol} {...m} />)}
    </div>
  );
}
