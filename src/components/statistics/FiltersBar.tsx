import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Clock, Download, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStatistics } from "./context";
import { DATE_PRESETS } from "@/lib/statistics/date-range";
import { hasActiveFilters } from "@/lib/statistics/filters";
import { EMPTY_FILTERS } from "@/lib/statistics/types";
import type { StatisticsFilters } from "@/lib/statistics/types";
import { exportToCsv, exportToJson } from "@/lib/utils/export-utils";
import {
  deleteSavedFilter, listSavedFilters, saveFilter,
} from "@/lib/statistics.functions";

const MARKETS = ["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"];
const DIRECTIONS = ["long", "short"] as const;
const SESSIONS = ["asia", "london", "new_york", "other"];

function MultiSelect({
  label, values, options, onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-full justify-start">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2 truncate">{label}</span>
          {values.length ? <Badge variant="secondary" className="h-5">{values.length}</Badge> : <span className="text-muted-foreground text-xs">All</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 pointer-events-auto" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {options.map((opt) => {
            const on = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onChange(on ? values.filter((v) => v !== opt.value) : [...values, opt.value])}
                className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted ${on ? "bg-primary/10 text-primary" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {values.length ? (
          <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => onChange([])}>Clear</Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const DAY_OPTIONS = [
  { value: "1", label: "Mon" }, { value: "2", label: "Tue" }, { value: "3", label: "Wed" },
  { value: "4", label: "Thu" }, { value: "5", label: "Fri" }, { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

const DAY_LABEL: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

/**
 * One chip per ACTIVE narrowing, each able to clear just itself.
 *
 * Built from the filters object rather than from the controls, so a dimension
 * that narrows the data always shows — including any set from a shared URL,
 * which has no control interaction behind it at all.
 */
type Chip = { key: string; label: string; clear: () => StatisticsFilters };

function buildChips(f: StatisticsFilters): Chip[] {
  const out: Chip[] = [];
  const list = (key: string, label: string, values: string[], patch: Partial<StatisticsFilters>) => {
    if (values.length) out.push({ key, label: `${label}: ${values.join(", ")}`, clear: () => ({ ...f, ...patch }) });
  };
  if (f.preset && f.preset !== EMPTY_FILTERS.preset) {
    out.push({ key: "preset", label: `Date: ${f.preset.replace(/_/g, " ")}`, clear: () => ({ ...f, preset: EMPTY_FILTERS.preset, from: null, to: null }) });
  }
  list("mkt", "Market", f.markets, { markets: [] });
  list("sym", "Pair", f.symbols, { symbols: [] });
  list("acc", "Account", f.accounts, { accounts: [] });
  list("dir", "Direction", f.directions, { directions: [] });
  list("sess", "Session", f.sessions, { sessions: [] });
  list("setup", "Setup", f.setups, { setups: [] });
  list("strat", "Strategy", f.strategies, { strategies: [] });
  list("emo", "Emotion", f.emotions, { emotions: [] });
  if (f.outcome && f.outcome !== "all") {
    out.push({ key: "outcome", label: `Outcome: ${f.outcome}`, clear: () => ({ ...f, outcome: "all" }) });
  }
  if (f.days?.length) {
    out.push({ key: "days", label: `Day: ${f.days.map((d) => DAY_LABEL[d] ?? d).join(", ")}`, clear: () => ({ ...f, days: [] }) });
  }
  if (f.hourFrom != null || f.hourTo != null) {
    out.push({
      key: "hours",
      label: `Time: ${f.hourFrom ?? "00"}:00 → ${f.hourTo ?? "23"}:00`,
      clear: () => ({ ...f, hourFrom: null, hourTo: null }),
    });
  }
  if (f.breakevenThreshold) {
    out.push({ key: "be", label: `BE ±${f.breakevenThreshold}`, clear: () => ({ ...f, breakevenThreshold: 0 }) });
  }
  if (f.source && f.source !== "all") {
    out.push({ key: "src", label: `Source: ${f.source}`, clear: () => ({ ...f, source: "all" }) });
  }
  return out;
}

export function FiltersBar() {
  const { filters, setFilters, resetFilters, raw, filtered, accounts } = useStatistics();
  const [customOpen, setCustomOpen] = useState(false);
  const qc = useQueryClient();
  const saveFn = useServerFn(saveFilter);
  const delFn = useServerFn(deleteSavedFilter);
  const listSavedFn = useServerFn(listSavedFilters);
  const savedQuery = useQuery({ queryKey: ["stats", "saved-filters"], queryFn: () => listSavedFn() });

  const symbols = useMemo(() => Array.from(new Set(raw.map((t) => t.symbol))).sort(), [raw]);
  const setups = useMemo(() => Array.from(new Set(raw.map((t) => t.setup).filter(Boolean) as string[])).sort(), [raw]);
  const strategies = useMemo(() => Array.from(new Set(raw.map((t) => t.strategy).filter(Boolean) as string[])).sort(), [raw]);
  const emotions = useMemo(() => Array.from(new Set(raw.flatMap((t) => t.emotions))).sort(), [raw]);

  const save = useMutation({
    mutationFn: async (name: string) => saveFn({ data: { name, filters: filters as unknown as Record<string, unknown> } }),
    onSuccess: () => { toast.success("Filter saved"); qc.invalidateQueries({ queryKey: ["stats", "saved-filters"] }); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stats", "saved-filters"] }); },
  });

  const chips = useMemo(() => buildChips(filters), [filters]);
  const anyActive = hasActiveFilters(filters);

  return (
    <div className="glass rounded-md p-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">

      <Select value={filters.preset} onValueChange={(v) => setFilters({ ...filters, preset: v as StatisticsFilters["preset"] })}>
        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {filters.preset === "custom" ? (
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 w-full justify-start"><CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate">{filters.from && filters.to ? `${filters.from.slice(0,10)} → ${filters.to.slice(0,10)}` : "Pick range"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">From</Label><Input type="date" value={filters.from?.slice(0,10) ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
                <div><Label className="text-xs">To</Label><Input type="date" value={filters.to?.slice(0,10) ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <MultiSelect label="Market" values={filters.markets} options={MARKETS.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))} onChange={(v) => setFilters({ ...filters, markets: v })} />
      <MultiSelect label="Pair" values={filters.symbols} options={symbols.map((s) => ({ value: s, label: s }))} onChange={(v) => setFilters({ ...filters, symbols: v })} />
      <MultiSelect label="Account" values={filters.accounts} options={accounts.map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => setFilters({ ...filters, accounts: v })} />
      <MultiSelect label="Direction" values={filters.directions} options={DIRECTIONS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))} onChange={(v) => setFilters({ ...filters, directions: v as ("long"|"short")[] })} />
      <MultiSelect label="Session" values={filters.sessions} options={SESSIONS.map((s) => ({ value: s, label: s.replace("_", " ") }))} onChange={(v) => setFilters({ ...filters, sessions: v })} />
      {setups.length ? <MultiSelect label="Setup" values={filters.setups} options={setups.map((s) => ({ value: s, label: s }))} onChange={(v) => setFilters({ ...filters, setups: v })} /> : null}
      {strategies.length ? <MultiSelect label="Strategy" values={filters.strategies} options={strategies.map((s) => ({ value: s, label: s }))} onChange={(v) => setFilters({ ...filters, strategies: v })} /> : null}
      {emotions.length ? <MultiSelect label="Emotion" values={filters.emotions} options={emotions.map((s) => ({ value: s, label: s }))} onChange={(v) => setFilters({ ...filters, emotions: v })} /> : null}

      {/* Outcome — derived from `pnl` against the breakeven threshold below,
          not stored on the trade. */}
      <Select
        value={filters.outcome ?? "all"}
        onValueChange={(v) => setFilters({ ...filters, outcome: v as StatisticsFilters["outcome"] })}
      >
        <SelectTrigger className="h-9 w-full" aria-label="Outcome"><SelectValue placeholder="Outcome" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any outcome</SelectItem>
          <SelectItem value="win">Wins</SelectItem>
          <SelectItem value="loss">Losses</SelectItem>
          <SelectItem value="breakeven">Breakeven</SelectItem>
        </SelectContent>
      </Select>

      <MultiSelect
        label="Day"
        values={filters.days.map(String)}
        options={DAY_OPTIONS}
        onChange={(v) => setFilters({ ...filters, days: v.map(Number) })}
      />

      {/* Hour window and the breakeven threshold share a popover: both are
          numeric refinements rather than pickers, and neither earns a slot on
          a bar that already has nine controls. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-full justify-start">
            <Clock className="h-3.5 w-3.5 mr-2 shrink-0" />
            <span className="truncate">
              {filters.hourFrom != null || filters.hourTo != null
                ? `${filters.hourFrom ?? "00"}:00 → ${filters.hourTo ?? "23"}:00`
                : "Time & BE"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 pointer-events-auto" align="start">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Hour of day — your local time</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input
                  type="number" min={0} max={23} placeholder="From"
                  aria-label="Hour from"
                  value={filters.hourFrom ?? ""}
                  onChange={(e) => setFilters({ ...filters, hourFrom: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <Input
                  type="number" min={0} max={23} placeholder="To"
                  aria-label="Hour to"
                  value={filters.hourTo ?? ""}
                  onChange={(e) => setFilters({ ...filters, hourTo: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                A window may wrap midnight — 22 → 4 is an overnight session.
              </p>
            </div>
            <div>
              <Label className="text-xs">Breakeven threshold</Label>
              <Input
                type="number" min={0} step="0.01"
                aria-label="Breakeven threshold"
                value={filters.breakevenThreshold || ""}
                placeholder="0"
                onChange={(e) => setFilters({ ...filters, breakevenThreshold: Number(e.target.value) || 0 })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                A P/L within this of zero counts as breakeven. At 0, only an
                exactly flat trade does.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {anyActive ? (
        <Button variant="ghost" size="sm" className="h-9 w-full" onClick={resetFilters} data-testid="filters-clear-all">
          <X className="h-3.5 w-3.5 mr-1" />Clear all
        </Button>
      ) : null}

      {/* Active-filter chips. Each removes only itself; "Clear all" above wipes
          the lot. Without this row a filter arriving from a shared URL is
          invisible — the dataset is narrowed and nothing on screen says why. */}
      {chips.length ? (
        <div className="col-span-full flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
          {chips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 py-1 pl-2 pr-1 font-normal">
              <span className="truncate max-w-[220px]">{c.label}</span>
              <button
                type="button"
                aria-label={`Remove filter ${c.label}`}
                className="grid h-4 w-4 place-items-center rounded hover:bg-background/60"
                onClick={() => setFilters(c.clear())}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="col-span-full flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
        <SaveFilterDialog onSave={(name) => save.mutate(name)} />
        {Array.isArray(savedQuery.data) && savedQuery.data.length ? (
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9">Saved ({savedQuery.data.length})</Button></PopoverTrigger>
            <PopoverContent className="w-64 p-2 pointer-events-auto" align="end">
              <div className="space-y-1">
                {savedQuery.data.map((f: any) => (
                  <div key={f.id} className="flex items-center gap-1">
                    <button className="flex-1 text-left px-2 py-1.5 text-xs rounded hover:bg-muted" onClick={() => setFilters({ ...EMPTY_FILTERS, ...(f.filters ?? {}) })}>{f.name}</button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove filter" onClick={() => remove.mutate(f.id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              const headers = ["Symbol", "Market", "Direction", "Status", "PnL", "RR", "Open", "Close", "Tags"];
              const rows = (filtered ?? []).map((t: any) => [
                t.symbol,
                t.market,
                t.direction,
                t.status,
                String(t.pnl ?? 0),
                String(t.rr ?? 0),
                t.opened_at,
                t.closed_at ?? "",
                (t.tags ?? []).join("|")
              ]);
              exportToCsv(`analytics-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
            }}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              exportToJson(`analytics-${new Date().toISOString().slice(0, 10)}.json`, filtered ?? []);
            }}
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
        </div>
      </div>
    </div>
  );
}


function SaveFilterDialog({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9"><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Save filter preset</DialogTitle></DialogHeader>
        <Input placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(""); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
