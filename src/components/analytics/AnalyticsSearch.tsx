import { useMemo } from "react";
import { Search } from "lucide-react";
import { useAnalytics } from "./AnalyticsProvider";
import { useStatistics } from "@/components/statistics/context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Instant search across the loaded analytics dataset — symbols, setups,
 * strategies, journal note references. Purely client-side.
 */
export function AnalyticsSearch() {
  const { search, setSearch } = useAnalytics();
  const { raw } = useStatistics();

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const symbols = new Set<string>();
    const setups = new Set<string>();
    const strategies = new Set<string>();
    for (const t of raw) {
      if (t.symbol.toLowerCase().includes(q)) symbols.add(t.symbol);
      if (t.setup && t.setup.toLowerCase().includes(q)) setups.add(t.setup);
      if (t.strategy && t.strategy.toLowerCase().includes(q)) strategies.add(t.strategy);
    }
    return [
      ...Array.from(symbols).slice(0, 5).map((s) => ({ kind: "Symbol", value: s })),
      ...Array.from(setups).slice(0, 5).map((s) => ({ kind: "Setup", value: s })),
      ...Array.from(strategies).slice(0, 5).map((s) => ({ kind: "Strategy", value: s })),
    ];
  }, [search, raw]);

  return (
    <Popover open={search.length >= 2 && results.length > 0}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trades, symbols, setups…"
            className="h-9 w-[220px] rounded-xl border border-border/60 bg-background/60 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-1.5">
        {results.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs">
            <span className="font-medium">{r.value}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.kind}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
