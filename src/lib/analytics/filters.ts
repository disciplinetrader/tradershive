/**
 * Shared analytics filter state (§13).
 *
 * ONE filter object drives every widget. Filtering is a pure predicate so the
 * engine, the tests and the cache key all agree on what "the current dataset"
 * means.
 */

import type { AnalyticsRecord } from "./model";
import { sessionAt } from "@/lib/market-sessions";

export type OutcomeFilter = "all" | "profit" | "loss" | "breakeven";
export type ArchiveFilter = "active" | "archived" | "both";

export interface AnalyticsFilters {
  /** Epoch ms, inclusive. */
  from: number | null;
  to: number | null;
  accounts: string[];
  symbols: string[];
  assetClasses: string[];
  directions: string[];
  setups: string[];
  playbooks: string[];
  sessions: string[];
  orderTypes: string[];
  closeReasons: string[];
  executionSources: string[];
  journalStatuses: string[];
  tags: string[];
  outcome: OutcomeFilter;
  archived: ArchiveFilter;
  /** Exclude fees from P/L aggregation (§4). */
  excludeFees: boolean;
}

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  from: null,
  to: null,
  accounts: [],
  symbols: [],
  assetClasses: [],
  directions: [],
  setups: [],
  playbooks: [],
  sessions: [],
  orderTypes: [],
  closeReasons: [],
  executionSources: [],
  journalStatuses: [],
  tags: [],
  outcome: "all",
  archived: "active",
  excludeFees: false,
};

function hits(selected: string[], value: string | null | undefined): boolean {
  if (selected.length === 0) return true;
  if (value == null) return false;
  return selected.includes(value);
}

export function matchesFilters(
  record: AnalyticsRecord,
  filters: AnalyticsFilters,
): boolean {
  if (filters.archived === "active" && record.archived) return false;
  if (filters.archived === "archived" && !record.archived) return false;

  const anchor = record.exitTime;
  if (filters.from != null && anchor < filters.from) return false;
  if (filters.to != null && anchor > filters.to) return false;

  if (!hits(filters.accounts, record.accountId)) return false;
  if (!hits(filters.symbols, record.symbol)) return false;
  if (!hits(filters.assetClasses, record.assetClass)) return false;
  if (!hits(filters.directions, record.direction)) return false;
  if (!hits(filters.setups, record.journal.setup)) return false;
  if (!hits(filters.playbooks, record.journal.playbook)) return false;
  if (!hits(filters.orderTypes, record.orderType)) return false;
  if (!hits(filters.closeReasons, record.closeReason)) return false;
  if (!hits(filters.executionSources, record.executionSource)) return false;
  if (!hits(filters.journalStatuses, record.journal.status)) return false;

  if (filters.sessions.length) {
    // Same expression as `selectFilterOptions`, deliberately: the dropdown is
    // built from this and matched against it, so any divergence silently drops
    // trades that belong in the selected session (MS-2).
    const session = record.journal.session ?? sessionAt(record.entryTime);
    if (!filters.sessions.includes(session)) return false;
  }

  if (filters.tags.length && !filters.tags.some((t) => record.journal.tags.includes(t))) return false;

  if (filters.outcome !== "all") {
    const want = filters.outcome === "profit" ? "win" : filters.outcome === "loss" ? "loss" : "breakeven";
    if (record.result !== want) return false;
  }

  return true;
}

export function applyFilters(
  records: readonly AnalyticsRecord[],
  filters: AnalyticsFilters,
): AnalyticsRecord[] {
  return records.filter((r) => matchesFilters(r, filters));
}

/** True when nothing is narrowed — used to tell "no trades" from "no matches". */
export function isDefaultFilters(f: AnalyticsFilters): boolean {
  return (
    f.from == null && f.to == null &&
    f.accounts.length === 0 && f.symbols.length === 0 && f.assetClasses.length === 0 &&
    f.directions.length === 0 && f.setups.length === 0 && f.playbooks.length === 0 &&
    f.sessions.length === 0 && f.orderTypes.length === 0 && f.closeReasons.length === 0 &&
    f.executionSources.length === 0 && f.journalStatuses.length === 0 && f.tags.length === 0 &&
    f.outcome === "all" && f.archived === "active"
  );
}

/** Stable, order-independent serialization for the cache key (§16). */
export function filtersFingerprint(f: AnalyticsFilters): string {
  const list = (xs: string[]) => [...xs].sort().join(",");
  return [
    f.from ?? "", f.to ?? "",
    list(f.accounts), list(f.symbols), list(f.assetClasses), list(f.directions),
    list(f.setups), list(f.playbooks), list(f.sessions), list(f.orderTypes),
    list(f.closeReasons), list(f.executionSources), list(f.journalStatuses), list(f.tags),
    f.outcome, f.archived, f.excludeFees ? "nofees" : "fees",
  ].join("|");
}

// ── URL persistence (§19H: filters survive refresh) ─────────────────────────

type RawSearch = Record<string, unknown>;

export function filtersToSearch(f: AnalyticsFilters): RawSearch {
  const out: RawSearch = {};
  const put = (k: string, v: string[] | null) => { if (v && v.length) out[k] = v.join(","); };
  if (f.from != null) out.from = f.from;
  if (f.to != null) out.to = f.to;
  put("acc", f.accounts);
  put("sym", f.symbols);
  put("cls", f.assetClasses);
  put("dir", f.directions);
  put("setup", f.setups);
  put("pb", f.playbooks);
  put("sess", f.sessions);
  put("ot", f.orderTypes);
  put("cr", f.closeReasons);
  put("es", f.executionSources);
  put("js", f.journalStatuses);
  put("tag", f.tags);
  if (f.outcome !== "all") out.outcome = f.outcome;
  if (f.archived !== "active") out.arch = f.archived;
  if (f.excludeFees) out.nofees = true;
  return out;
}

export function filtersFromSearch(search: RawSearch): AnalyticsFilters {
  const arr = (k: string): string[] => {
    const v = search[k];
    return typeof v === "string" && v.length ? v.split(",").filter(Boolean) : [];
  };
  const num = (k: string): number | null => {
    const v = search[k];
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const outcome = search.outcome;
  const archived = search.arch;
  return {
    from: num("from"),
    to: num("to"),
    accounts: arr("acc"),
    symbols: arr("sym"),
    assetClasses: arr("cls"),
    directions: arr("dir"),
    setups: arr("setup"),
    playbooks: arr("pb"),
    sessions: arr("sess"),
    orderTypes: arr("ot"),
    closeReasons: arr("cr"),
    executionSources: arr("es"),
    journalStatuses: arr("js"),
    tags: arr("tag"),
    outcome: outcome === "profit" || outcome === "loss" || outcome === "breakeven" ? outcome : "all",
    archived: archived === "archived" || archived === "both" ? archived : "active",
    excludeFees: search.nofees === true || search.nofees === "true",
  };
}
