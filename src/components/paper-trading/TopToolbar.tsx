import { useEffect, useState } from "react";
import { RefreshCcw, Search, Settings, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MARKET_TABS, type PaperMarket } from "@/lib/paper-trading/symbols";
import { useQueryClient } from "@tanstack/react-query";
import { AccountSwitcher } from "./AccountSwitcher";
import { SymbolSearch } from "./SymbolSearch";
import { usePaper } from "./context";

export function TopToolbar() {
  const qc = useQueryClient();
  const { symbol, market } = usePaper();
  const [open, setOpen] = useState(false);
  // Which market the picker should open filtered to. Clicking a market tab
  // used to call `setMarket` directly, which changed the data VENUE while
  // leaving the symbol alone — BTC/USDT routed to forex, fetching nothing,
  // with the old candles still drawn because the symbol had not changed.
  // The tabs are now navigation: they open the picker, and the instrument
  // changes only when a symbol is chosen.
  const [pickerMarket, setPickerMarket] = useState<PaperMarket | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); setOpen(true); return; }
      if (e.key === "/" && !inField) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-1 items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-sm font-semibold shadow-sm transition hover:border-primary/40"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          {symbol}
          <span className="ml-2 hidden text-[10px] text-muted-foreground group-hover:text-foreground md:inline">⌘F</span>
        </button>
        <Tabs
          value={market}
          onValueChange={(v) => { setPickerMarket(v as PaperMarket); setOpen(true); }}
        >
          <TabsList className="hidden md:flex">
            {MARKET_TABS.map((m) => (
              <TabsTrigger key={m.value} value={m.value} className="text-xs">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Favorite">
          <Star className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh"
          onClick={() => qc.invalidateQueries({ queryKey: ["paper"] })}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <AccountSwitcher />
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <SymbolSearch
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setPickerMarket(undefined); }}
        initialMarket={pickerMarket}
      />
    </div>
  );
}
