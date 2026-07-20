import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MARKET_TABS, SYMBOL_CATALOG, type PaperMarket } from "@/lib/paper-trading/symbols";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaper } from "./context";
import { Star } from "lucide-react";

const RECENT_KEY = "th_paper_recent_symbols";

function readRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
function pushRecent(sym: string) {
  try {
    const prev = readRecents().filter((s) => s !== sym);
    localStorage.setItem(RECENT_KEY, JSON.stringify([sym, ...prev].slice(0, 12)));
  } catch { /* ignore */ }
}

export function SymbolSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { setSymbol, market, setMarket } = usePaper();
  const [tab, setTab] = useState<PaperMarket>(market);
  const [q, setQ] = useState("");

  const symbols = useMemo(
    () => SYMBOL_CATALOG.filter((s) => s.market === tab && (
      q === "" || s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase())
    )),
    [tab, q],
  );
  const recents = useMemo(() => (open ? readRecents() : []), [open]);

  const choose = (symbol: string) => {
    pushRecent(symbol);
    setSymbol(symbol);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <div className="border-b border-border/60 p-3">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as PaperMarket); setMarket(v as PaperMarket); }}>
            <TabsList className="w-full justify-start gap-1 bg-transparent p-0">
              {MARKET_TABS.map((m) => (
                <TabsTrigger key={m.value} value={m.value} className="data-[state=active]:bg-primary/10">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search symbols…" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No symbols match.</CommandEmpty>
            {recents.length > 0 && (
              <CommandGroup heading="Recent">
                {recents.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => choose(s)}>
                    <Star className="mr-2 h-3.5 w-3.5 text-warning" /> {s}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={MARKET_TABS.find((m) => m.value === tab)?.label}>
              {symbols.map((s) => (
                <CommandItem key={s.symbol} value={s.symbol} onSelect={() => choose(s.symbol)}>
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
