import { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { marketData } from "@/lib/market-data/engine";
import type { MarketKind, SymbolMeta } from "@/lib/market-data/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MARKET_TABS: { key: "all" | MarketKind; label: string }[] = [
  { key: "all", label: "All" }, { key: "forex", label: "Forex" }, { key: "crypto", label: "Crypto" },
  { key: "metals", label: "Metals" }, { key: "indices", label: "Indices" },
];

export function MarketSymbolSearch({ onSelect, favorites, onToggleFavorite }: {
  onSelect?: (s: SymbolMeta) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (symbol: string) => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | MarketKind>("all");
  const [rows, setRows] = useState<SymbolMeta[]>([]);
  useEffect(() => {
    marketData.init();
    let cancel = false;
    marketData.searchSymbols({ q, market: tab === "all" ? undefined : tab, limit: 60 }).then((r) => { if (!cancel) setRows(r); });
    return () => { cancel = true; };
  }, [q, tab]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => (Number(!!b.isPopular) - Number(!!a.isPopular)) || a.symbol.localeCompare(b.symbol))
  , [rows]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbols (EURUSD, BTC, gold…)" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-1">
        {MARKET_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition",
            tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}>{t.label}</button>
        ))}
      </div>
      <ul className="max-h-[420px] divide-y divide-border/50 overflow-y-auto rounded-lg border border-border/60 bg-card/30" role="listbox">
        {sorted.map((s) => {
          const fav = favorites?.has(s.symbol);
          return (
            <li key={s.symbol} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-primary/5" role="option" aria-selected={fav}>
              <button onClick={() => onSelect?.(s)} className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{s.symbol}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.market}</span>
                </div>
                <div className="text-xs text-muted-foreground">{s.displayName}</div>
              </button>
              {onToggleFavorite && (
                <Button size="icon" variant="ghost" onClick={() => onToggleFavorite(s.symbol)} aria-label={fav ? "Unfavorite" : "Favorite"}>
                  <Star className={cn("h-4 w-4", fav && "fill-warning text-warning")} />
                </Button>
              )}
            </li>
          );
        })}
        {sorted.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No symbols found.</li>}
      </ul>
    </div>
  );
}
