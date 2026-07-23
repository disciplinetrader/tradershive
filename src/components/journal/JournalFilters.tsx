import { useEffect, useMemo, useState } from "react";
import { Search, X, RotateCcw, Filter as FilterIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DIRECTION_OPTIONS,
  MARKET_OPTIONS,
  RESULT_OPTIONS,
  SESSION_OPTIONS,
  DEFAULT_SETUPS,
  DEFAULT_EMOTIONS,
  JOURNAL_STORAGE_KEYS,
} from "@/lib/journal/constants";
import type { JournalTag, JournalTaxonomy } from "@/lib/journal/api";
import { cn } from "@/lib/utils";

export type JournalFiltersState = {
  q: string;
  from: string; // yyyy-mm-dd
  to: string;
  market: string; // "" | market
  symbol: string;
  direction: string;
  result: string;
  session: string;
  setup: string;
  emotion: string;
  tagIds: string[];
};

export const EMPTY_FILTERS: JournalFiltersState = {
  q: "",
  from: "",
  to: "",
  market: "",
  symbol: "",
  direction: "",
  result: "",
  session: "",
  setup: "",
  emotion: "",
  tagIds: [],
};

export function loadStoredFilters(): JournalFiltersState {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEYS.filters);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch {
    return EMPTY_FILTERS;
  }
}

const ANY = "__any__";
function toSel(v: string): string { return v === "" ? ANY : v; }
function fromSel(v: string): string { return v === ANY ? "" : v; }

export function JournalFilters({
  filters,
  onChange,
  tags,
  taxonomy,
}: {
  filters: JournalFiltersState;
  onChange: (next: JournalFiltersState) => void;
  tags: JournalTag[];
  taxonomy: JournalTaxonomy[];
}) {
  const [local, setLocal] = useState(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => {
      onChange(local);
      try { localStorage.setItem(JOURNAL_STORAGE_KEYS.filters, JSON.stringify(local)); } catch { /* ignore */ }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  const customSetups = useMemo(() => taxonomy.filter((t) => t.kind === "setup"), [taxonomy]);
  const customEmotions = useMemo(() => taxonomy.filter((t) => t.kind === "emotion"), [taxonomy]);

  const activeCount = useMemo(() => {
    let n = 0;
    (["from", "to", "market", "symbol", "direction", "result", "session", "setup", "emotion"] as const).forEach((k) => {
      if (local[k]) n += 1;
    });
    if (local.tagIds.length) n += local.tagIds.length;
    return n;
  }, [local]);

  const toggleTag = (id: string) => {
    setLocal((p) => ({
      ...p,
      tagIds: p.tagIds.includes(id) ? p.tagIds.filter((x) => x !== id) : [...p.tagIds, id],
    }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative sm:min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={local.q}
          onChange={(e) => setLocal((p) => ({ ...p, q: e.target.value }))}
          placeholder="Search notes, pair, tags, trade ID…"
          className="pl-9"
          aria-label="Search journal"
        />
        {local.q ? (
          <button
            onClick={() => setLocal((p) => ({ ...p, q: "" }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <FilterSelect
        placeholder="Market"
        value={local.market}
        onChange={(v) => setLocal((p) => ({ ...p, market: v }))}
        options={MARKET_OPTIONS}
      />
      <FilterSelect
        placeholder="Direction"
        value={local.direction}
        onChange={(v) => setLocal((p) => ({ ...p, direction: v }))}
        options={DIRECTION_OPTIONS}
      />
      <FilterSelect
        placeholder="Result"
        value={local.result}
        onChange={(v) => setLocal((p) => ({ ...p, result: v }))}
        options={RESULT_OPTIONS}
      />
      <FilterSelect
        placeholder="Session"
        value={local.session}
        onChange={(v) => setLocal((p) => ({ ...p, session: v }))}
        options={SESSION_OPTIONS}
      />
      <FilterSelect
        placeholder="Setup"
        value={local.setup}
        onChange={(v) => setLocal((p) => ({ ...p, setup: v }))}
        options={[...DEFAULT_SETUPS, ...customSetups.map((c) => ({ value: c.value, label: c.label }))]}
      />
      <FilterSelect
        placeholder="Emotion"
        value={local.emotion}
        onChange={(v) => setLocal((p) => ({ ...p, emotion: v }))}
        options={[...DEFAULT_EMOTIONS, ...customEmotions.map((c) => ({ value: c.value, label: c.label }))]}
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <FilterIcon className="mr-1.5 h-4 w-4" />
            More
            {activeCount > 0 ? (
              <Badge className="ml-2 h-5 min-w-5 rounded-full bg-primary/20 px-1.5 text-xs text-primary">
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Date range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={local.from}
                onChange={(e) => setLocal((p) => ({ ...p, from: e.target.value }))}
                aria-label="From date"
              />
              <Input
                type="date"
                value={local.to}
                onChange={(e) => setLocal((p) => ({ ...p, to: e.target.value }))}
                aria-label="To date"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pair</p>
            <Input
              value={local.symbol}
              onChange={(e) => setLocal((p) => ({ ...p, symbol: e.target.value }))}
              placeholder="e.g. EUR/USD"
            />
          </div>

          {tags.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const active = local.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/15 text-primary hover:bg-primary/20"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/40 hover:text-foreground",
                      )}
                      style={active ? undefined : { borderColor: `${t.color}55`, color: t.color }}
                      aria-pressed={active}

                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {activeCount > 0 || local.q ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => setLocal(EMPTY_FILTERS)}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={toSel(value)} onValueChange={(v) => onChange(fromSel(v))}>
      <SelectTrigger className="h-9 w-full sm:w-[130px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function applyFilters(
  entries: import("@/lib/journal/api").JournalEntry[],
  filters: JournalFiltersState,
  entryTags: Map<string, Set<string>>,
): import("@/lib/journal/api").JournalEntry[] {
  const q = filters.q.trim().toLowerCase();
  const from = filters.from ? new Date(filters.from + "T00:00:00").getTime() : null;
  const to = filters.to ? new Date(filters.to + "T23:59:59").getTime() : null;

  return entries.filter((e) => {
    if (filters.market && e.market !== filters.market) return false;
    if (filters.symbol && !(e.symbol ?? "").toLowerCase().includes(filters.symbol.toLowerCase()))
      return false;
    if (filters.direction && e.direction !== filters.direction) return false;
    if (filters.session && e.session !== filters.session) return false;
    if (filters.setup && e.setup !== filters.setup) return false;
    if (filters.emotion && !(e.emotions ?? []).includes(filters.emotion)) return false;
    if (filters.result) {
      const pnl = Number(e.pnl ?? 0);
      if (filters.result === "win" && pnl <= 0) return false;
      if (filters.result === "loss" && pnl >= 0) return false;
      if (filters.result === "breakeven" && pnl !== 0) return false;
    }
    if (from || to) {
      const t = e.closed_at ? new Date(e.closed_at).getTime() : new Date(e.created_at).getTime();
      if (from && t < from) return false;
      if (to && t > to) return false;
    }
    if (filters.tagIds.length) {
      const set = entryTags.get(e.id);
      if (!set) return false;
      if (!filters.tagIds.every((id) => set.has(id))) return false;
    }
    if (q) {
      const hay = [
        e.symbol ?? "",
        e.strategy ?? "",
        e.setup ?? "",
        e.notes_text ?? "",
        e.id,
        ...(e.emotions ?? []),
        ...(e.mistakes ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
