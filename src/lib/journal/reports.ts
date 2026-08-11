/**
 * Journal reports — six slices of ONE dataset.
 *
 * Two rules hold the surface together, and both exist because breaking either
 * one produces a number that looks authoritative and is a lie:
 *
 * 1. ONE DATASET, FILTERED ONCE. Every report reads the same
 *    `AnalyticsRecord[]`, produced here and nowhere else. If two reports could
 *    disagree about the same trades the whole surface loses credibility, so
 *    there is exactly one place that decides what is in scope.
 *
 * 2. NOTHING IS MEASURABLE UNTIL IT IS. A cohort of one trade does not have a
 *    "100% win rate"; it has an unmeasurable one. Every row carries `rankable`
 *    and every rate carries a measurable flag, and the UI is required to render
 *    the absence rather than a confident zero.
 *
 * Timezone: day/weekday/hour are attributed in the trader's zone; sessions are
 * UTC-anchored because London is a market fact, not a viewer preference.
 */
import type { JournalEntry } from "@/lib/journal/api";
import { fromJournalEntry } from "@/lib/analytics/normalize";
import { countsTowardAnalytics } from "@/lib/journal/metrics";
import { buildEquitySeries, type EquitySeries } from "@/lib/analytics/equity";
import { computeDrawdown, type DrawdownMetrics } from "@/lib/analytics/drawdown";
import { groupBy, timeAnalytics, type CohortRow, type TimeAnalytics } from "@/lib/analytics/cohorts";
import type { AnalyticsRecord } from "@/lib/analytics/model";

/** Below this, a cohort's rates are reported as not measurable. */
export const MIN_SAMPLE = 5;

export type JournalReportFilters = {
  /** Inclusive ISO dates, `yyyy-mm-dd`. Empty means unbounded. */
  from: string;
  to: string;
  /** Tag slugs; an entry matches if it carries ANY of them, across kinds. */
  tagValues: string[];
  /** Weekday indices 0–6 (Sun–Sat) in the display timezone. Empty = all. */
  weekdays: number[];
  /** Trade ratings 1–5. Empty = all, including unrated. */
  ratings: number[];
  symbol: string;
};

export const EMPTY_REPORT_FILTERS: JournalReportFilters = {
  from: "",
  to: "",
  tagValues: [],
  weekdays: [],
  ratings: [],
  symbol: "",
};

/** Every tag value on an entry, across all kinds. */
export function tagValuesOf(r: AnalyticsRecord): string[] {
  return [
    ...(r.journal.tags ?? []),
    ...(r.journal.mistakes ?? []),
    ...(r.journal.emotions ?? []),
    ...(r.journal.setup ? [r.journal.setup] : []),
  ];
}

/**
 * The one place scope is decided.
 *
 * `countsTowardAnalytics` first — a report must never count an entry the
 * calendar and the overview would exclude.
 */
export function buildDataset(
  entries: JournalEntry[],
  filters: JournalReportFilters,
  timezone: string,
  weekdayOf: (epochMs: number, tz: string) => number,
  /** Trader's noise threshold; a result inside ±band is break-even. */
  breakevenBand = 0,
): AnalyticsRecord[] {
  const fromMs = filters.from ? Date.parse(`${filters.from}T00:00:00Z`) : null;
  const toMs = filters.to ? Date.parse(`${filters.to}T23:59:59.999Z`) : null;
  const wanted = new Set(filters.tagValues);
  const symbol = filters.symbol.trim().toLowerCase();
  const weekdays = new Set(filters.weekdays);
  const ratings = new Set(filters.ratings);

  const out: AnalyticsRecord[] = [];
  for (const e of entries) {
    if (!countsTowardAnalytics(e)) continue;
    // Filtering on rating necessarily drops unrated entries — an unrated trade
    // is not a 0, so it cannot satisfy "show me my 4s and 5s".
    if (ratings.size && (e.rating == null || !ratings.has(e.rating))) continue;
    const r = fromJournalEntry(e, breakevenBand);
    if (fromMs != null && r.exitTime < fromMs) continue;
    if (toMs != null && r.exitTime > toMs) continue;
    if (symbol && !r.symbol.toLowerCase().includes(symbol)) continue;
    if (wanted.size && !tagValuesOf(r).some((t) => wanted.has(t))) continue;
    if (weekdays.size && !weekdays.has(weekdayOf(r.exitTime, timezone))) continue;
    out.push(r);
  }
  return out;
}

/* ── measurability ───────────────────────────────────────────────────────── */

export type Measurable<T> =
  | { measurable: true; value: T; sample: number }
  | { measurable: false; reason: string; sample: number };

/**
 * A rate is measurable only with enough decided trades behind it.
 *
 * This is the guard against "100% win rate (1 trade)" — a number that reads as
 * a finding and is noise. The reason string is rendered verbatim, so it has to
 * say what is missing, not just that something is.
 */
export function measurableRate(sample: number, value: number, min = MIN_SAMPLE): Measurable<number> {
  if (sample <= 0) return { measurable: false, reason: "No trades in range", sample };
  if (sample < min) {
    return {
      measurable: false,
      reason: `Needs ${min} trades, has ${sample}`,
      sample,
    };
  }
  return { measurable: true, value, sample };
}

/* ── the six ─────────────────────────────────────────────────────────────── */

export type JournalReports = {
  /** 1 — equity curve; drawdown is the underwater plot of this same series. */
  equity: EquitySeries;
  drawdown: DrawdownMetrics;
  /** 2 — setup performance, ranked by expectancy rather than win rate. */
  setups: CohortRow[];
  /** 3 — what each mistake tag costs, in money and R. */
  mistakes: MistakeCostRow[];
  /** 4 + 5 — session (UTC-anchored) and hour of day (trader's zone). */
  time: TimeAnalytics;
  /** 6 — what is structurally different about winners. */
  anatomy: WinLossAnatomy;
  /** Shared footer: how much of the dataset each report could actually use. */
  sample: number;
};

export type MistakeCostRow = {
  value: string;
  occurrences: number;
  netPnl: number;
  avgR: number | null;
  /** Net P&L of trades WITHOUT this mistake, per trade — the counterfactual. */
  baselinePerTrade: number;
  /** occurrences × (baselinePerTrade − thisPerTrade). Positive = it costs you. */
  estimatedCost: number;
};

/**
 * What each mistake tag costs.
 *
 * The cost is a *contrast*, not a sum of losses: trades carrying the tag
 * compared against trades that do not. Summing the losing trades that happen to
 * carry a tag would blame the tag for ordinary variance.
 *
 * Deliberately reported from the first occurrence — unlike the rate reports,
 * this is legible at n=3, and n=3 is where traders actually are. It is stated
 * as an estimate, with the occurrence count always shown beside it.
 */
export function mistakeCosts(records: readonly AnalyticsRecord[]): MistakeCostRow[] {
  const all = records.length;
  if (!all) return [];
  const totalPnl = records.reduce((s, r) => s + r.netPnl, 0);

  const byTag = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    for (const m of r.journal.mistakes ?? []) {
      if (!m) continue;
      byTag.set(m, [...(byTag.get(m) ?? []), r]);
    }
  }

  const rows: MistakeCostRow[] = [];
  for (const [value, tagged] of byTag) {
    const occurrences = tagged.length;
    const netPnl = tagged.reduce((s, r) => s + r.netPnl, 0);
    const rs = tagged.map((r) => r.realizedR).filter((v): v is number => v != null);
    const others = all - occurrences;
    const baselinePerTrade = others > 0 ? (totalPnl - netPnl) / others : 0;
    const thisPerTrade = netPnl / occurrences;
    rows.push({
      value,
      occurrences,
      netPnl,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      baselinePerTrade,
      estimatedCost: occurrences * (baselinePerTrade - thisPerTrade),
    });
  }
  return rows.sort((a, b) => b.estimatedCost - a.estimatedCost);
}

export type WinLossAnatomy = {
  wins: AnatomySide;
  losses: AnatomySide;
  /** Null when either side is empty — a comparison of one thing is not one. */
  holdTimeRatio: number | null;
};

export type AnatomySide = {
  count: number;
  netPnl: number;
  avgPnl: number | null;
  avgR: number | null;
  avgHoldSeconds: number | null;
  avgQuantity: number | null;
  topTags: { value: string; count: number }[];
};

function anatomySide(records: readonly AnalyticsRecord[]): AnatomySide {
  const count = records.length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const tally = new Map<string, number>();
  for (const r of records) for (const t of tagValuesOf(r)) tally.set(t, (tally.get(t) ?? 0) + 1);

  return {
    count,
    netPnl: records.reduce((s, r) => s + r.netPnl, 0),
    avgPnl: avg(records.map((r) => r.netPnl)),
    avgR: avg(records.map((r) => r.realizedR).filter((v): v is number => v != null)),
    avgHoldSeconds: avg(records.map((r) => r.duration).filter((v) => v > 0)),
    avgQuantity: avg(records.map((r) => r.quantity).filter((v): v is number => v != null)),
    topTags: [...tally.entries()]
      .map(([value, c]) => ({ value, count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

export function winLossAnatomy(records: readonly AnalyticsRecord[]): WinLossAnatomy {
  const wins = anatomySide(records.filter((r) => r.result === "win"));
  const losses = anatomySide(records.filter((r) => r.result === "loss"));
  const ratio =
    wins.avgHoldSeconds != null && losses.avgHoldSeconds != null && wins.avgHoldSeconds > 0
      ? losses.avgHoldSeconds / wins.avgHoldSeconds
      : null;
  return { wins, losses, holdTimeRatio: ratio };
}

/** Build all six from one dataset. */
export function buildReports(
  records: AnalyticsRecord[],
  timezone: string,
  startingBalance: number | null,
): JournalReports {
  const equity = buildEquitySeries(records, {
    resolution: "daily",
    timezone,
    startingBalance,
  });
  return {
    equity,
    // Derived from the same series the curve renders — not a second
    // computation, which is why these are one report and not two.
    drawdown: computeDrawdown(equity),
    setups: groupBy(records, (r) => r.journal.setup ?? null, { minSample: MIN_SAMPLE }),
    mistakes: mistakeCosts(records),
    time: timeAnalytics(records, { timezone, minSample: MIN_SAMPLE }),
    anatomy: winLossAnatomy(records),
    sample: records.length,
  };
}
