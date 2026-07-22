/**
 * Journal V2 — Smart instrument search input.
 *
 * Fuzzy typeahead over `INSTRUMENTS` with:
 * - Recency + popularity ranking
 * - Alias / common-name matching (e.g. "Gold" → XAU/USD)
 * - Keyboard nav (↑ ↓ Enter Esc)
 * - Highlighted matched substring
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  findInstrument,
  markInstrumentUsed,
  searchInstruments,
  type InstrumentRecord,
  type JournalMarket,
} from "@/lib/journal/instruments";

const MARKET_LABEL: Record<JournalMarket, string> = {
  forex: "Forex",
  crypto: "Crypto",
  stocks: "Stocks",
  indices: "Indices",
  futures: "Futures",
  metals: "Metals",
};

export function InstrumentSearchInput({
  value,
  onSelect,
  marketFilter,
  placeholder = "Search instrument (e.g. EUR/USD, Gold, BTC)",
  autoFocus = false,
}: {
  value: string;
  onSelect: (instrument: InstrumentRecord) => void;
  marketFilter?: JournalMarket | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  const matches = useMemo(
    () => searchInstruments(query, { market: marketFilter, limit: 10 }),
    [query, marketFilter],
  );
  const currentInstrument = useMemo(() => findInstrument(query), [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function commit(instrument: InstrumentRecord) {
    markInstrumentUsed(instrument.symbol);
    onSelect(instrument);
    setQuery(instrument.symbol);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
              setOpen(true);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              const m = matches[activeIdx];
              if (m) { e.preventDefault(); commit(m.instrument); }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="h-11 pl-9 uppercase tracking-wide"
        />
        {currentInstrument ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {MARKET_LABEL[currentInstrument.market]}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border/60 bg-popover shadow-elegant">
          {matches.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No instruments match "{query}"</div>
          ) : (
            <ul role="listbox" className="py-1">
              {matches.map((m, i) => (
                <li key={m.instrument.symbol}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); commit(m.instrument); }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                      i === activeIdx ? "bg-accent" : "hover:bg-accent/70",
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold uppercase text-muted-foreground">
                      {m.instrument.market === "crypto" ? "₿" : m.instrument.market.slice(0, 3)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {renderHighlight(m.instrument.symbol, m.highlight)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{m.instrument.name}</span>
                      </div>
                      {m.instrument.commonNames.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {m.instrument.commonNames.slice(0, 3).map((cn) => (
                            <span key={cn} className="rounded bg-muted/60 px-1.5 py-0.5">{cn}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-[10px] uppercase text-muted-foreground">
                      {m.matchedField === "common" || m.matchedField === "alias" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : null}
                      {m.score >= 800 ? <Star className="h-3 w-3 text-warning" /> : null}
                      {MARKET_LABEL[m.instrument.market]}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function renderHighlight(label: string, ranges: [number, number][]) {
  if (!ranges.length) return label;
  const [start, end] = ranges[0];
  return (
    <>
      {label.slice(0, start)}
      <mark className="rounded bg-primary/20 px-0.5 text-primary">{label.slice(start, end)}</mark>
      {label.slice(end)}
    </>
  );
}
