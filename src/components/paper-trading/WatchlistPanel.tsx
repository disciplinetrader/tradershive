import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Star, StarOff, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addWatchlistSymbol, createPaperWatchlist, deletePaperWatchlist,
  listPaperWatchlists, removeWatchlistSymbol, toggleWatchlistSymbolFavorite,
} from "@/lib/paper-trading.functions";
import { useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import { MARKET_TABS, SYMBOL_CATALOG, findSymbol, type PaperMarket } from "@/lib/paper-trading/symbols";
import { cn } from "@/lib/utils";
import { usePaper } from "./context";

type Watchlist = { id: string; name: string; market: PaperMarket | null; is_default: boolean; sort_order: number };
type WatchSym = { id: string; watchlist_id: string; symbol: string; market: PaperMarket; is_favorite: boolean; sort_order: number };

export function WatchlistPanel() {
  const qc = useQueryClient();
  const { symbol, setSymbol } = usePaper();
  const quotes = useLiveQuotes();

  const fetch = useServerFn(listPaperWatchlists);
  const addSym = useServerFn(addWatchlistSymbol);
  const removeSym = useServerFn(removeWatchlistSymbol);
  const toggleFav = useServerFn(toggleWatchlistSymbolFavorite);
  const createWl = useServerFn(createPaperWatchlist);
  const deleteWl = useServerFn(deletePaperWatchlist);

  const { data, isLoading } = useQuery({
    queryKey: ["paper", "watchlists"],
    queryFn: () => fetch() as unknown as Promise<{ lists: Watchlist[]; symbols: WatchSym[] }>,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"symbol" | "change" | "price">("symbol");
  const [newSymbol, setNewSymbol] = useState("");
  const [newList, setNewList] = useState("");

  const lists = data?.lists ?? [];
  const currentId = activeId ?? lists[0]?.id ?? null;
  const active = lists.find((l) => l.id === currentId) ?? null;

  const rows = useMemo(() => {
    if (!data) return [] as WatchSym[];
    const inList = active
      ? data.symbols.filter((s) => s.watchlist_id === active.id)
      : data.symbols.filter((s) => s.is_favorite);
    const filtered = q
      ? inList.filter((s) => s.symbol.toLowerCase().includes(q.toLowerCase()))
      : inList;
    return [...filtered].sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      const qa = quotes[a.symbol]; const qb = quotes[b.symbol];
      if (sort === "price") return (qb?.price ?? 0) - (qa?.price ?? 0);
      return (qb?.change ?? 0) - (qa?.change ?? 0);
    });
  }, [data, active, q, sort, quotes]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["paper", "watchlists"] });

  const addMut = useMutation({
    mutationFn: async (input: { watchlist_id: string; symbol: string; market: PaperMarket }) =>
      addSym({ data: input }),
    onSuccess: () => { invalidate(); setNewSymbol(""); },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeSym({ data: { id } }),
    onSuccess: invalidate,
  });
  const favMut = useMutation({
    mutationFn: (r: WatchSym) => toggleFav({ data: { id: r.id, is_favorite: !r.is_favorite } }),
    onSuccess: invalidate,
  });
  const createWlMut = useMutation({
    mutationFn: (name: string) => createWl({ data: { name } }),
    onSuccess: () => { toast.success("Watchlist created"); setNewList(""); invalidate(); },
  });
  const deleteWlMut = useMutation({
    mutationFn: (id: string) => deleteWl({ data: { id } }),
    onSuccess: () => { toast.success("Watchlist removed"); setActiveId(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleAdd = () => {
    if (!newSymbol || !active) return;
    const meta = findSymbol(newSymbol.toUpperCase()) ?? SYMBOL_CATALOG.find((s) => s.symbol.toUpperCase() === newSymbol.toUpperCase());
    if (!meta) return toast.error("Unknown symbol");
    addMut.mutate({ watchlist_id: active.id, symbol: meta.symbol, market: meta.market });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select value={currentId ?? undefined} onValueChange={setActiveId}>
          <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Favorites" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__favs" disabled>— Favorites (all lists) —</SelectItem>
            {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Manage watchlists"><Plus className="h-4 w-4" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="New list name" value={newList} onChange={(e) => setNewList(e.target.value)} />
                <Button size="sm" onClick={() => newList.trim() && createWlMut.mutate(newList.trim())}>Add</Button>
              </div>
              {active && !active.is_default && (
                <Button variant="ghost" size="sm" className="w-full text-danger"
                  onClick={() => deleteWlMut.mutate(active.id)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete "{active.name}"
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 pl-7" />
        </div>
        <Select value={sort} onValueChange={(v: "symbol"|"change"|"price") => setSort(v)}>
          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="symbol">A–Z</SelectItem>
            <SelectItem value="change">Δ %</SelectItem>
            <SelectItem value="price">Price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {active && (
        <div className="flex items-center gap-1.5">
          <Input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="Add e.g. EUR/USD" className="h-8" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Button size="sm" className="h-8 gradient-primary text-primary-foreground" onClick={handleAdd}>Add</Button>
        </div>
      )}

      <ul className="scrollbar-thin flex-1 space-y-1 overflow-y-auto pr-1">
        {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        {!isLoading && rows.length === 0 && (
          <EmptyState className="py-6" title="No symbols yet" description="Add symbols to start tracking." />
        )}
        <AnimatePresence initial={false}>
          {rows.map((r) => {
            const meta = findSymbol(r.symbol);
            const q = quotes[r.symbol];
            const up = (q?.change ?? 0) >= 0;
            const selected = r.symbol === symbol;
            return (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={cn(
                  "group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-accent/40",
                  selected && "border-primary/40 bg-primary/5",
                )}
              >
                <button onClick={() => favMut.mutate(r)} className="shrink-0 text-muted-foreground hover:text-warning" aria-label="Toggle favorite">
                  {r.is_favorite ? <Star className="h-3.5 w-3.5 fill-warning text-warning" /> : <StarOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setSymbol(r.symbol)}
                  className="flex min-w-0 flex-1 items-center justify-between text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.symbol}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{meta?.name ?? r.market}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs tabular-nums">{q ? q.price.toFixed(meta?.decimals ?? 2) : "—"}</p>
                    <p className={cn("font-mono text-[10px] tabular-nums", up ? "text-success" : "text-danger")}>
                      {q ? `${up ? "+" : ""}${q.change.toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => removeMut.mutate(r.id)}
                  className="opacity-0 transition group-hover:opacity-100" aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-danger" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
