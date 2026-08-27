/**
 * The statistics filter predicate, and its URL encoding.
 *
 * Extracted from `components/statistics/context.tsx` so the rule that decides
 * which trades are counted can be tested without mounting a provider. A filter
 * that renders but does not narrow the dataset is indistinguishable from a
 * working one at the control, and that class of bug has shipped repeatedly —
 * so the predicate is the thing under test, not the UI.
 *
 * The search-param encoding deliberately mirrors `lib/analytics/filters.ts`
 * (comma-joined values, short keys) rather than inventing a second convention.
 * Those two filter systems already need converging; a divergent URL grammar
 * would make that worse.
 */
import type { AnalyticsTrade, StatisticsFilters, TradeOutcome } from "./types";
import { EMPTY_FILTERS } from "./types";
import { resolveDateRange } from "./date-range";

export type RawSearch = Record<string, unknown>;

/**
 * The timestamp every date-shaped filter reads.
 *
 * Closed time when the trade has one, entry time otherwise — the same anchor
 * the date-range filter has always used. Day-of-week and hour-of-day reuse it
 * ON PURPOSE: two date filters disagreeing about which timestamp they mean
 * would quietly return different sets for the same visible selection.
 */
export function filterAnchor(t: AnalyticsTrade): Date {
  return t.closed_at ? new Date(t.closed_at) : new Date(t.opened_at);
}

/**
 * Win / loss / breakeven for one trade.
 *
 * `threshold` is a magnitude in account currency: anything within it of zero is
 * breakeven. At the default of 0 only an exactly-flat trade qualifies, which is
 * strict and honest — see `StatisticsFilters.breakevenThreshold`.
 */
export function classifyOutcome(pnl: number, threshold: number): Exclude<TradeOutcome, "all"> {
  const t = Number.isFinite(threshold) && threshold > 0 ? threshold : 0;
  if (!Number.isFinite(pnl)) return "breakeven";
  if (Math.abs(pnl) <= t) return "breakeven";
  return pnl > 0 ? "win" : "loss";
}

/** Does this trade survive the filters? */
export function matchesStatisticsFilters(
  t: AnalyticsTrade,
  filters: StatisticsFilters,
  range: { from: Date | null; to: Date | null },
): boolean {
  const anchor = filterAnchor(t);

  if (range.from && anchor < range.from) return false;
  if (range.to && anchor > range.to) return false;
  if (filters.markets.length && !filters.markets.includes(t.market)) return false;
  if (filters.symbols.length && !filters.symbols.includes(t.symbol)) return false;
  if (filters.accounts.length && (!t.account_id || !filters.accounts.includes(t.account_id))) return false;
  if (filters.directions.length && !filters.directions.includes(t.direction)) return false;
  if (filters.setups.length && (!t.setup || !filters.setups.includes(t.setup))) return false;
  if (filters.strategies.length && (!t.strategy || !filters.strategies.includes(t.strategy))) return false;
  if (filters.sessions.length && (!t.session || !filters.sessions.includes(t.session))) return false;
  if (filters.emotions.length && !filters.emotions.some((e) => t.emotions?.includes(e))) return false;
  if (filters.source && filters.source !== "all" && t.source !== filters.source) return false;

  if (filters.outcome && filters.outcome !== "all") {
    if (classifyOutcome(t.pnl, filters.breakevenThreshold) !== filters.outcome) return false;
  }

  // Local time, and the control says so. Reinterpreting timestamps in a chosen
  // timezone is a separate, unanswered product question — see the timezone note
  // in docs/known-issues.md. Claiming a timezone we do not apply would be worse
  // than showing the one we do.
  if (filters.days?.length && !filters.days.includes(anchor.getDay())) return false;

  const h = anchor.getHours();
  const from = filters.hourFrom;
  const to = filters.hourTo;
  if (from != null && to != null) {
    // A window that wraps midnight (22 -> 4) is a union, not an empty range.
    const wraps = from > to;
    const inside = wraps ? h >= from || h <= to : h >= from && h <= to;
    if (!inside) return false;
  } else if (from != null && h < from) {
    return false;
  } else if (to != null && h > to) {
    return false;
  }

  return true;
}

/** Apply the filters to a dataset. */
export function filterTrades(trades: AnalyticsTrade[], filters: StatisticsFilters): AnalyticsTrade[] {
  const range = resolveDateRange(filters.preset, filters.from, filters.to);
  return trades.filter((t) => matchesStatisticsFilters(t, filters, range));
}

/* ══════════════════════════════════════════════════════════════════════
   URL encoding — same grammar as lib/analytics/filters.ts
   ══════════════════════════════════════════════════════════════════════ */

export function statsFiltersToSearch(f: StatisticsFilters): RawSearch {
  const out: RawSearch = {};
  const put = (k: string, v: string[] | undefined) => { if (v && v.length) out[k] = v.join(","); };

  if (f.preset && f.preset !== EMPTY_FILTERS.preset) out.preset = f.preset;
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  put("mkt", f.markets);
  put("sym", f.symbols);
  put("acc", f.accounts);
  put("dir", f.directions);
  put("setup", f.setups);
  put("strat", f.strategies);
  put("sess", f.sessions);
  put("emo", f.emotions);
  if (f.source && f.source !== "all") out.src = f.source;
  if (f.outcome && f.outcome !== "all") out.outcome = f.outcome;
  if (f.breakevenThreshold) out.be = String(f.breakevenThreshold);
  if (f.days?.length) out.days = f.days.join(",");
  if (f.hourFrom != null) out.hf = String(f.hourFrom);
  if (f.hourTo != null) out.ht = String(f.hourTo);
  return out;
}

/**
 * Undo the router's own encoding before reading a value.
 *
 * TanStack Router JSON-encodes what it writes, so a filter this module
 * serialised as `days=1` comes back on the next read as the string `"1"` —
 * quotes included. Splitting that on commas yields `['"1"']`, `Number` gives
 * NaN, and the filter is silently dropped.
 *
 * The failure is specific and nasty: a HAND-WRITTEN url works, so the feature
 * looks fine until the user interacts with it — remove one chip and the
 * surviving filters are rewritten, re-read, and quietly lost. Caught by an e2e
 * that removed a chip and found `days` had become `"\"1\""`.
 */
function unwrap(v: unknown): unknown {
  if (typeof v !== "string") return v;
  if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

export function statsFiltersFromSearch(raw: RawSearch): StatisticsFilters {
  const search: RawSearch = {};
  for (const [k, v] of Object.entries(raw ?? {})) search[k] = unwrap(v);

  /**
   * A comma-joined list from the URL.
   *
   * Accepts a number and an array, not just a string, because the router
   * COERCES a bare numeric search value: `?days=1` arrives as the number 1, not
   * "1". A string-only reader silently returns [] for it — the filter is in the
   * URL, the data is unfiltered, and nothing says so. Caught by an e2e that
   * loaded `?outcome=win&days=1` and found no Day chip.
   */
  const arr = (k: string): string[] => {
    const v = search[k];
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === "number" && Number.isFinite(v)) return [String(v)];
    return typeof v === "string" && v.length ? v.split(",").filter(Boolean) : [];
  };
  const num = (k: string): number | null => {
    const v = search[k];
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const hour = (k: string): number | null => {
    const n = num(k);
    return n != null && n >= 0 && n <= 23 ? Math.floor(n) : null;
  };
  const outcome = String(search.outcome ?? "");
  const be = num("be");

  return {
    ...EMPTY_FILTERS,
    preset: (typeof search.preset === "string" ? search.preset : EMPTY_FILTERS.preset) as StatisticsFilters["preset"],
    from: typeof search.from === "string" ? search.from : null,
    to: typeof search.to === "string" ? search.to : null,
    markets: arr("mkt"),
    symbols: arr("sym"),
    accounts: arr("acc"),
    directions: arr("dir") as StatisticsFilters["directions"],
    setups: arr("setup"),
    strategies: arr("strat"),
    sessions: arr("sess"),
    emotions: arr("emo"),
    source: (typeof search.src === "string" ? search.src : "all") as StatisticsFilters["source"],
    outcome: (["win", "loss", "breakeven"].includes(outcome) ? outcome : "all") as TradeOutcome,
    breakevenThreshold: be != null && be >= 0 ? be : 0,
    days: arr("days").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    hourFrom: hour("hf"),
    hourTo: hour("ht"),
  };
}

/** True when anything is narrowing the dataset — drives the Clear affordance. */
export function hasActiveFilters(f: StatisticsFilters): boolean {
  return Object.keys(statsFiltersToSearch(f)).length > 0;
}
