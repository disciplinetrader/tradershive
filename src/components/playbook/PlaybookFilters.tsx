import { Search, Star, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PlaybookFilterState = {
  search: string;
  market: string;
  timeframe: string;
  tag: string;
  favoritesOnly: boolean;
  hasTradesOnly: boolean;
};

const MARKETS = ["Forex", "Crypto", "Stocks", "Indices", "Commodities", "Futures"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"];

export function PlaybookFilters({
  value,
  onChange,
  tagOptions,
  count,
}: {
  value: PlaybookFilterState;
  onChange: (patch: Partial<PlaybookFilterState>) => void;
  tagOptions: string[];
  count?: number;
}) {
  const active = value.market || value.timeframe || value.tag || value.favoritesOnly || value.hasTradesOnly;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search setups, tags, notes…"
            className="h-10 pl-9"
          />
        </div>
        <Button
          variant={value.favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ favoritesOnly: !value.favoritesOnly })}
          className="gap-1.5"
        >
          <Star className={cn("h-3.5 w-3.5", value.favoritesOnly && "fill-yellow-400 text-yellow-400")} />
          Favorites
        </Button>
        <Button
          variant={value.hasTradesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ hasTradesOnly: !value.hasTradesOnly })}
        >
          Has trades
        </Button>
        {typeof count === "number" ? (
          <Badge variant="secondary" className="ml-auto">{count} setup{count === 1 ? "" : "s"}</Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="mr-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" /> Market
        </div>
        <Chip label="All" active={!value.market} onClick={() => onChange({ market: "" })} />
        {MARKETS.map((m) => (
          <Chip key={m} label={m} active={value.market === m} onClick={() => onChange({ market: value.market === m ? "" : m })} />
        ))}
        <div className="mx-2 h-4 w-px bg-border/60" />
        <div className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">Timeframe</div>
        <Chip label="All" active={!value.timeframe} onClick={() => onChange({ timeframe: "" })} />
        {TIMEFRAMES.map((tf) => (
          <Chip key={tf} label={tf} active={value.timeframe === tf} onClick={() => onChange({ timeframe: value.timeframe === tf ? "" : tf })} />
        ))}
      </div>
      {tagOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">Tags</div>
          {tagOptions.slice(0, 20).map((t) => (
            <Chip key={t} label={`#${t}`} active={value.tag === t} onClick={() => onChange({ tag: value.tag === t ? "" : t })} />
          ))}
        </div>
      ) : null}
      {active ? (
        <button
          type="button"
          onClick={() => onChange({ market: "", timeframe: "", tag: "", favoritesOnly: false, hasTradesOnly: false })}
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
