import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RANKING_CATEGORIES } from "@/lib/social/constants";
import { COUNTRIES, EXPERIENCE_LEVELS, LEAGUES, MARKETS, TRADING_STYLES } from "@/lib/constants";

export interface LeaderboardFiltersState {
  category: string;
  country: string | null;
  league: string | null;
  market: string | null;
  tradingStyle: string | null;
  experience: string | null;
  search: string;
}

export const INITIAL_FILTERS: LeaderboardFiltersState = {
  category: "xp",
  country: null,
  league: null,
  market: null,
  tradingStyle: null,
  experience: null,
  search: "",
};

const NONE = "__all__";
const val = (v: string | null) => (v == null ? NONE : v);
const norm = (v: string) => (v === NONE ? null : v);

export function LeaderboardFilters({
  state,
  onChange,
  hideCountry,
  hideLeague,
}: {
  state: LeaderboardFiltersState;
  onChange: (s: LeaderboardFiltersState) => void;
  hideCountry?: boolean;
  hideLeague?: boolean;
}) {
  const set = <K extends keyof LeaderboardFiltersState>(k: K, v: LeaderboardFiltersState[K]) =>
    onChange({ ...state, [k]: v });
  const hasFilters =
    !!state.country || !!state.league || !!state.market || !!state.tradingStyle || !!state.experience || !!state.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative sm:min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search trader"
          value={state.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <Select value={state.category} onValueChange={(v) => set("category", v)}>
        <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RANKING_CATEGORIES.map((c) => (
            <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideLeague ? (
        <Select value={val(state.league)} onValueChange={(v) => set("league", norm(v))}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="League" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All leagues</SelectItem>
            {LEAGUES.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : null}

      {!hideCountry ? (
        <Select value={val(state.country)} onValueChange={(v) => set("country", norm(v))}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE}>All countries</SelectItem>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={val(state.market)} onValueChange={(v) => set("market", norm(v))}>
        <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Market" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All markets</SelectItem>
          {MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.emoji} {m.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={val(state.tradingStyle)} onValueChange={(v) => set("tradingStyle", norm(v))}>
        <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Style" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All styles</SelectItem>
          {TRADING_STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={val(state.experience)} onValueChange={(v) => set("experience", norm(v))}>
        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Experience" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All levels</SelectItem>
          {EXPERIENCE_LEVELS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...INITIAL_FILTERS, category: state.category })}>
          <X className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      ) : null}
    </div>
  );
}
