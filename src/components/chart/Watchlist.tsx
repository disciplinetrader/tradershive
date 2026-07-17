import { useEffect, useState } from "react";
import { Search, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { marketData } from "@/lib/market-data/engine";
import { useLiveQuote } from "@/lib/market-data/hooks";
import type { SymbolMeta } from "@/lib/market-data/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listFavorites, toggleFavorite } from "@/lib/chart/storage";

interface Props {
  symbol: string;
  onPick: (s: SymbolMeta | { symbol: string; market?: any }) => void;
}

export function Watchlist({ symbol, onPick }: Props) {
  const [items, setItems] = useState<SymbolMeta[]>([]);
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  useEffect(() => { listFavorites().then((rows) => setFavs(rows.map((r: any) => r.symbol))); }, [userId]);

  useEffect(() => {
    marketData.init();
    marketData.searchSymbols({ q: query, limit: 30 }).then(setItems).catch(() => setItems([]));
  }, [query]);

  const rows = favs.length && !query
    ? [
        ...items.filter((i) => favs.includes(i.symbol)),
        ...items.filter((i) => !favs.includes(i.symbol)),
      ]
    : items;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search symbols…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border/60 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Symbol</span><span>Last</span><span>Chg%</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((s) => (
          <WatchRow key={s.symbol} sym={s} active={s.symbol === symbol}
            fav={favs.includes(s.symbol)}
            onPick={() => onPick(s)}
            onToggleFav={async () => {
              if (!userId) return;
              const on = !favs.includes(s.symbol);
              await toggleFavorite(userId, s.symbol, on);
              setFavs((prev) => on ? [...prev, s.symbol] : prev.filter((v) => v !== s.symbol));
            }} />
        ))}
        {!rows.length ? <div className="p-6 text-center text-sm text-muted-foreground">No symbols</div> : null}
      </div>
    </div>
  );
}

function WatchRow({ sym, active, fav, onPick, onToggleFav }: {
  sym: SymbolMeta; active: boolean; fav: boolean; onPick: () => void; onToggleFav: () => void;
}) {
  const q = useLiveQuote(sym.symbol, sym.market);
  const chg = q?.changePct ?? 0;
  return (
    <button onClick={onPick}
      className={cn("grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-sm transition hover:bg-primary/5",
        active && "bg-primary/10")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <button onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            className={cn("shrink-0 rounded p-0.5 transition", fav ? "text-yellow-400" : "text-muted-foreground/40 hover:text-muted-foreground")}>
            <Star className="h-3.5 w-3.5" fill={fav ? "currentColor" : "none"} />
          </button>
          <span className="truncate font-medium">{sym.symbol}</span>
        </div>
        <div className="ml-5 truncate text-[10px] uppercase text-muted-foreground">{sym.market}</div>
      </div>
      <span className="tabular-nums text-xs">{q?.last?.toFixed(sym.pricePrecision) ?? "—"}</span>
      <span className={cn("tabular-nums text-xs", chg >= 0 ? "text-emerald-400" : "text-rose-400")}>
        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
      </span>
    </button>
  );
}

export function WatchlistEmpty() {
  return <Trash2 className="hidden" />;
}
