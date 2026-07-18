import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Star, StarOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addWatchlistItem, listWatchlist, removeWatchlistItem, toggleWatchlistFavorite } from "@/lib/dashboard.functions";
import { useLiveQuote } from "@/lib/market-data/hooks";
import type { MarketKind } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MARKET_TABS = [
  { value: "all", label: "All" },
  { value: "forex", label: "Forex" },
  { value: "crypto", label: "Crypto" },
  { value: "index", label: "Indices" },
  { value: "metal", label: "Metals" },
] as const;

export function Watchlist() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listWatchlist);
  const addItem = useServerFn(addWatchlistItem);
  const removeItem = useServerFn(removeWatchlistItem);
  const toggleFav = useServerFn(toggleWatchlistFavorite);

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => fetchList(),
  });

  const [tab, setTab] = useState<(typeof MARKET_TABS)[number]["value"]>("all");
  const [q, setQ] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newMarket, setNewMarket] = useState("forex");

  const list = data?.lists?.[0];
  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (it) =>
        (tab === "all" || it.market === tab) &&
        (!term || it.symbol.toLowerCase().includes(term)),
    );
  }, [items, tab, q]);

  

  const addMut = useMutation({
    mutationFn: (v: { symbol: string; market: string }) =>
      addItem({ data: { watchlist_id: list!.id, symbol: v.symbol, market: v.market } }),
    onSuccess: () => {
      setNewSymbol("");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Could not add symbol"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeItem({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const favMut = useMutation({
    mutationFn: (v: { id: string; favorite: boolean }) => toggleFav({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {MARKET_TABS.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const sym = newSymbol.trim();
          if (!sym || !list) return;
          addMut.mutate({ symbol: sym, market: newMarket });
        }}
      >
        <div className="relative flex-1 min-w-[140px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="pl-9"
            aria-label="Search watchlist"
          />
        </div>
        <Input
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
          placeholder="Add symbol"
          className="w-32"
          aria-label="Add symbol"
        />
        <Select value={newMarket} onValueChange={setNewMarket}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="forex">Forex</SelectItem>
            <SelectItem value="crypto">Crypto</SelectItem>
            <SelectItem value="index">Index</SelectItem>
            <SelectItem value="metal">Metal</SelectItem>
            <SelectItem value="energy">Energy</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="icon" disabled={!newSymbol || addMut.isPending} aria-label="Add">
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-3 space-y-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState icon={Star} title="Empty watchlist" description="Add a symbol above to start tracking." className="py-8" />
        ) : (
          filtered.map((it) => (
            <WatchlistRow
              key={it.id}
              symbol={it.symbol}
              market={it.market as MarketKind}
              favorite={!!it.favorite}
              onFav={() => favMut.mutate({ id: it.id, favorite: !it.favorite })}
              onRemove={() => removeMut.mutate(it.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WatchlistRow({
  symbol,
  market,
  favorite,
  onFav,
  onRemove,
}: {
  symbol: string;
  market: MarketKind;
  favorite: boolean;
  onFav: () => void;
  onRemove: () => void;
}) {
  const q = useLiveQuote(symbol, market);
  const change = q?.changePct ?? 0;
  const up = change >= 0;
  return (
    <div className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 transition hover:border-border/60 hover:bg-surface/60">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onFav} className="text-muted-foreground transition hover:text-warning" aria-label={favorite ? "Unfavorite" : "Favorite"}>
          {favorite ? <Star className="h-3.5 w-3.5 fill-warning text-warning" /> : <StarOff className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{symbol}</div>
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{market}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {q?.last != null ? (
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums">{q.last.toLocaleString()}</div>
            <div className={cn("text-xs font-medium", up ? "text-primary" : "text-danger")}>
              {up ? "+" : ""}{change.toFixed(2)}%
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">…</span>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 transition group-hover:opacity-100" onClick={onRemove} aria-label="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
