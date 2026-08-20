import { describe, expect, it } from "vitest";

import {
  AnalyticsCache, analyticsCacheKey, runAnalyticsCached, tradeVersionOf, journalVersionOf,
} from "../cache";
import { runAnalytics } from "../engine";
import { EMPTY_ANALYTICS_FILTERS, applyFilters, filtersFromSearch, filtersToSearch } from "../filters";
import { buildEquitySeries } from "../equity";
import { computeDrawdown } from "../drawdown";
import { computePerformance } from "../expectancy";
import { computeBehaviour } from "../behaviour";
import { accountComparison, groupBy, playbookAnalytics, rank, timeAnalytics } from "../cohorts";
import { classifyTimeBand, dayKey, weekdayLabel } from "../periods";
import type { AnalyticsSession } from "../model";
import { selectFilterOptions } from "../selectors";
import { dedupeRecords, fromClosedTrade, summarizeTape } from "../normalize";
import { EMPTY_JOURNAL_METADATA, EMPTY_TAPE, type AnalyticsDataset, type AnalyticsRecord } from "../model";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { PositionExecution } from "@/lib/chart/orders/executions";
import { resultOf } from "@/lib/journal/derive";

// ── Fixtures ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 10, 0, 0); // Monday 10:00 UTC

function rec(over: Partial<AnalyticsRecord> = {}): AnalyticsRecord {
  const netPnl = over.netPnl ?? 100;
  return {
    tradeId: over.tradeId ?? `t${Math.random().toString(36).slice(2, 8)}`,
    positionId: null,
    accountId: "acc1",
    journalEntryId: null,
    source: "position_tool",
    symbol: "EUR/USD",
    market: "forex",
    assetClass: "forex",
    direction: "long",
    orderType: "market",
    entryTime: T0,
    exitTime: T0 + 3_600_000,
    duration: 3600,
    fillPrice: 1.1,
    exitPrice: 1.11,
    initialStop: 1.09,
    initialTarget: 1.13,
    finalStop: 1.09,
    grossPnl: netPnl,
    fees: 0,
    netPnl,
    result: resultOf(netPnl) ?? "breakeven",
    riskAmount: 100,
    realizedR: netPnl / 100,
    plannedR: 3,
    returnPercent: 1,
    quantity: 1,
    closeReason: "manual",
    executionSource: "manual",
    slippage: 0,
    archived: false,
    journal: { ...EMPTY_JOURNAL_METADATA },
    tape: { ...EMPTY_TAPE },
    ...over,
  };
}

function dataset(records: AnalyticsRecord[], startingBalance: number | null = 10_000): AnalyticsDataset {
  return {
    records,
    accounts: [
      {
        accountId: "acc1", name: "Main", currency: "USD",
        startingBalance, balance: null, equity: null, peakEquity: null,
        realizedPnl: null, floatingPnl: null, timestamp: T0, archived: false,
      },
    ],
    timezone: "UTC",
    tradeVersion: tradeVersionOf(records),
    journalVersion: "j0",
  };
}

const run = (records: AnalyticsRecord[], filters = EMPTY_ANALYTICS_FILTERS, balance: number | null = 10_000) =>
  runAnalytics(dataset(records, balance), filters);

// ── 1–8 Core metrics ────────────────────────────────────────────────────────

describe("core performance metrics", () => {
  const sample = [
    rec({ tradeId: "a", netPnl: 200, grossPnl: 210, fees: 10, realizedR: 2 }),
    rec({ tradeId: "b", netPnl: -100, grossPnl: -95, fees: 5, realizedR: -1 }),
    rec({ tradeId: "c", netPnl: 0, grossPnl: 0, fees: 0, realizedR: 0 }),
    rec({ tradeId: "d", netPnl: 400, grossPnl: 400, fees: 0, realizedR: 4 }),
  ];

  it("1. aggregates net P/L", () => {
    expect(computePerformance(sample).netPnl).toBe(500);
  });

  it("2. aggregates total R", () => {
    expect(computePerformance(sample).totalR).toBe(5);
  });

  it("3. classifies results with the canonical helper", () => {
    const p = computePerformance(sample);
    expect([p.wins, p.losses, p.breakEvens]).toEqual([2, 1, 1]);
    expect(sample.every((r) => r.result === resultOf(r.netPnl))).toBe(true);
  });

  it("4. computes win rate", () => {
    expect(computePerformance(sample).winRate).toBe(50);
  });

  it("5. computes profit factor", () => {
    expect(computePerformance(sample).profitFactor).toBe(6); // 600 / 100
  });

  it("6. computes expectancy", () => {
    expect(computePerformance(sample).expectancy).toBe(125);
    expect(computePerformance(sample).expectancyR).toBeCloseTo(1.25, 10);
  });

  it("7. computes payoff ratio", () => {
    expect(computePerformance(sample).payoffRatio).toBe(3); // avg win 300 / avg loss 100
  });

  it("8. computes average and median R", () => {
    const p = computePerformance(sample);
    expect(p.averageR).toBeCloseTo(1.25, 10);
    expect(p.medianR).toBeCloseTo(1, 10); // -1, 0, 2, 4 → (0+2)/2
  });
});

// ── 9–12 Equity series ──────────────────────────────────────────────────────

describe("equity curve", () => {
  const spread = [
    rec({ tradeId: "z", netPnl: 50, exitTime: T0 + 2 * DAY }),
    rec({ tradeId: "a", netPnl: 100, exitTime: T0 }),
    rec({ tradeId: "b", netPnl: -30, exitTime: T0 + DAY }),
  ];

  it("9. orders deterministically by exit time then id", () => {
    const s = buildEquitySeries(spread);
    expect(s.points.map((p) => p.cumulativePnl)).toEqual([100, 70, 120]);
    // Recomputing yields the identical curve.
    expect(buildEquitySeries([...spread].reverse()).points.map((p) => p.cumulativePnl)).toEqual([100, 70, 120]);
  });

  it("10. aggregates daily", () => {
    const s = buildEquitySeries(spread, { resolution: "daily", timezone: "UTC" });
    expect(s.points).toHaveLength(3);
    expect(s.points[0].key).toBe(dayKey(T0, "UTC"));
  });

  it("11. aggregates weekly", () => {
    const s = buildEquitySeries(spread, { resolution: "weekly", timezone: "UTC" });
    expect(s.points).toHaveLength(1);
    expect(s.points[0].periodPnl).toBe(120);
  });

  it("12. aggregates monthly", () => {
    const s = buildEquitySeries(spread, { resolution: "monthly", timezone: "UTC" });
    expect(s.points).toHaveLength(1);
    expect(s.points[0].key).toBe("2026-01");
  });
});

// ── 13–17 Drawdown and streaks ──────────────────────────────────────────────

describe("drawdown", () => {
  const path = [
    rec({ tradeId: "1", netPnl: 100, exitTime: T0 }),
    rec({ tradeId: "2", netPnl: -60, exitTime: T0 + DAY }),
    rec({ tradeId: "3", netPnl: -40, exitTime: T0 + 2 * DAY }),
    rec({ tradeId: "4", netPnl: 150, exitTime: T0 + 3 * DAY }),
  ];

  it("13. finds the maximum drawdown from the equity curve, not summed losses", () => {
    const dd = computeDrawdown(buildEquitySeries(path));
    expect(dd.maxDrawdown).toBe(100);
  });

  it("14. records the recovery date and duration", () => {
    const dd = computeDrawdown(buildEquitySeries(path));
    expect(dd.recoveryDate).toBe(T0 + 3 * DAY);
    expect(dd.episodes[0].recovered).toBe(true);
  });

  it("15. reports the current drawdown while underwater", () => {
    const dd = computeDrawdown(buildEquitySeries(path.slice(0, 3)));
    expect(dd.currentDrawdown).toBe(100);
    expect(dd.episodes[0].recovered).toBe(false);
  });

  it("16. finds the longest losing streak", () => {
    expect(computePerformance(path).maxConsecutiveLosses).toBe(2);
  });

  it("17. finds the longest winning streak", () => {
    const wins = [
      rec({ tradeId: "w1", netPnl: 1, exitTime: T0 }),
      rec({ tradeId: "w2", netPnl: 2, exitTime: T0 + DAY }),
      rec({ tradeId: "w3", netPnl: -1, exitTime: T0 + 2 * DAY }),
      rec({ tradeId: "w4", netPnl: 3, exitTime: T0 + 3 * DAY }),
    ];
    expect(computePerformance(wins).maxConsecutiveWins).toBe(2);
  });
});

// ── 18–20 Scope, weighting and filter consistency ───────────────────────────

describe("scoping and filters", () => {
  const multi = [
    rec({ tradeId: "a1", accountId: "acc1", netPnl: 100 }),
    rec({ tradeId: "b1", accountId: "acc2", netPnl: -50 }),
  ];

  it("18. isolates accounts", () => {
    const r = applyFilters(multi, { ...EMPTY_ANALYTICS_FILTERS, accounts: ["acc1"] });
    expect(r).toHaveLength(1);
    expect(computePerformance(r).netPnl).toBe(100);
  });

  it("19. weights combined accounts by starting balance, never by averaging %", () => {
    const cmp = accountComparison(multi, [
      { accountId: "acc1", name: "A", currency: "USD", startingBalance: 10_000, balance: null, equity: null, peakEquity: null, realizedPnl: null, floatingPnl: null, timestamp: T0, archived: false },
      { accountId: "acc2", name: "B", currency: "USD", startingBalance: 1_000, balance: null, equity: null, peakEquity: null, realizedPnl: null, floatingPnl: null, timestamp: T0, archived: false },
    ]);
    // Naive average of +1% and −5% would be −2%; correct weighting is +50/11000.
    expect(cmp.combinedReturnPercent).toBeCloseTo((50 / 11_000) * 100, 10);
  });

  it("20. keeps every panel on the same filtered sample", () => {
    const result = run(multi, { ...EMPTY_ANALYTICS_FILTERS, accounts: ["acc1"] });
    expect(result.records).toHaveLength(1);
    expect(result.performance.tradeCount).toBe(1);
    expect(result.breakdown.symbol.reduce((s, r) => s + r.count, 0)).toBe(1);
    expect(result.time.sessions.reduce((s, r) => s + r.count, 0)).toBe(1);
    expect(result.comparison.accounts.reduce((s, r) => s + r.count, 0)).toBe(1);
  });
});

// ── MS-2 · one session vocabulary ───────────────────────────────────────────
//
// Written 2026-08-20 BEFORE the fix, the same way MS-1's weekend cases went
// into the fixture before the weekday gate existed.
//
// `journal.session` carries the CANONICAL label (`@/lib/market-sessions`,
// written by `public.detect_session`). Rows without one fell back to
// `classifySession`, a UTC-hour partition with its own ids. Two vocabularies
// reached one `groupBy` and one string `includes`, so the same session could
// appear twice under different spellings.
//
//   Wed 16:30Z   canonical `new_york`   ·  partition `newyork`   → SPLITS
//   Wed 09:00Z   canonical `london`     ·  partition `london`    → collides
//   Sat 14:00Z   canonical `off_hours`  ·  partition `newyork`   → weekend
//
// The 09:00Z control is why this was easy to miss: two of four ids happen to
// match, so the bug is intermittent by time of day.

describe("MS-2 — session vocabularies must not split a cohort", () => {
  const WED_NY = Date.UTC(2026, 6, 15, 16, 30);
  const WED_LON = Date.UTC(2026, 6, 15, 9, 0);
  const SAT = Date.UTC(2026, 6, 11, 14, 0);

  const labelled = (at: number, session: AnalyticsSession) =>
    rec({ entryTime: at, exitTime: at + 3_600_000, journal: { ...EMPTY_JOURNAL_METADATA, session } });
  const unlabelled = (at: number) =>
    rec({ entryTime: at, exitTime: at + 3_600_000, journal: { ...EMPTY_JOURNAL_METADATA, session: null } });

  it("offers ONE filter option when a labelled and an unlabelled trade share a session", () => {
    const opts = selectFilterOptions(dataset([labelled(WED_NY, "new_york"), unlabelled(WED_NY)]));
    // Before the fix this is ["new_york", "newyork"] — the same session twice.
    expect(opts.sessions).toEqual(["new_york"]);
  });

  it("still offers one option where the two vocabularies happened to agree", () => {
    const opts = selectFilterOptions(dataset([labelled(WED_LON, "london"), unlabelled(WED_LON)]));
    expect(opts.sessions).toEqual(["london"]);
  });

  it("labels an unlabelled weekend trade off_hours, not a session that was shut", () => {
    const opts = selectFilterOptions(dataset([unlabelled(SAT)]));
    // Before the fix: ["newyork"] — New York, on a Saturday.
    expect(opts.sessions).toEqual(["off_hours"]);
  });

  it("does not drop the unlabelled trade when filtering by the labelled one's session", () => {
    // selectors builds the dropdown, filters matches against it. If they
    // disagree, picking an option silently excludes trades that belong in it.
    const res = run(
      [labelled(WED_NY, "new_york"), unlabelled(WED_NY)],
      { ...EMPTY_ANALYTICS_FILTERS, sessions: ["new_york"] },
    );
    expect(res.records.length).toBe(2);
  });
});

// ── 21–22 Timezone classification ───────────────────────────────────────────

describe("timezone-aware classification", () => {
  it("21. classifies TIME BANDS from UTC windows, not browser-local time", () => {
    // Renamed from sessions 2026-08-20 (MS-2). These are fixed UTC bands, not
    // market sessions — the ids no longer resemble session labels, which is
    // what stops the two being compared as if they were one vocabulary.
    expect(classifyTimeBand(Date.UTC(2026, 0, 5, 2))?.id).toBe("utc_0_8");
    expect(classifyTimeBand(Date.UTC(2026, 0, 5, 9))?.id).toBe("utc_8_13");
    expect(classifyTimeBand(Date.UTC(2026, 0, 5, 15))?.id).toBe("utc_13_21");
  });

  it("22. classifies day of week in the configured timezone", () => {
    const lateUtc = Date.UTC(2026, 0, 5, 23, 30); // Monday 23:30 UTC
    expect(weekdayLabel(lateUtc, "UTC")).toBe("Monday");
    expect(weekdayLabel(lateUtc, "Asia/Tokyo")).toBe("Tuesday");
  });
});

// ── 23–26 Cohorts ───────────────────────────────────────────────────────────

describe("cohorts", () => {
  const journalOf = (setup: string) => ({ ...EMPTY_JOURNAL_METADATA, setup, playbook: setup });

  const many = [
    ...Array.from({ length: 12 }, (_, i) => rec({ tradeId: `p${i}`, netPnl: 10, journal: journalOf("Breakout") })),
    ...Array.from({ length: 3 }, (_, i) => rec({ tradeId: `q${i}`, netPnl: 500, journal: journalOf("Reversal") })),
  ];

  it("23. groups by playbook", () => {
    const rows = playbookAnalytics(many);
    expect(rows.map((r) => r.key).sort()).toEqual(["Breakout", "Reversal"]);
  });

  it("24. enforces the minimum sample threshold before ranking", () => {
    const rows = playbookAnalytics(many, { minSample: 10 });
    const ranked = rank(rows);
    expect(ranked.best?.key).toBe("Breakout"); // Reversal has only 3 trades
    expect(ranked.excluded).toBe(1);
    // Configurable: lower the bar and Reversal becomes eligible.
    expect(rank(playbookAnalytics(many, { minSample: 2 })).best?.key).toBe("Reversal");
  });

  it("25. groups by symbol", () => {
    const rows = groupBy(
      [rec({ symbol: "BTC/USDT", netPnl: 10 }), rec({ symbol: "EUR/USD", netPnl: -5 })],
      (r) => r.symbol,
    );
    expect(rows.map((r) => r.key)).toEqual(["BTC/USDT", "EUR/USD"]);
  });

  it("26. groups by direction", () => {
    const rows = groupBy(
      [rec({ direction: "long", netPnl: 10 }), rec({ direction: "short", netPnl: 20 })],
      (r) => r.direction,
    );
    expect(rows[0].key).toBe("short");
  });
});

// ── 27–29 Data hygiene ──────────────────────────────────────────────────────

describe("data hygiene", () => {
  it("27. excludes archived trades by default and includes them on request", () => {
    const set = [rec({ tradeId: "live", netPnl: 10 }), rec({ tradeId: "old", netPnl: 999, archived: true })];
    expect(run(set).performance.netPnl).toBe(10);
    expect(run(set, { ...EMPTY_ANALYTICS_FILTERS, archived: "both" }).performance.netPnl).toBe(1009);
    expect(run(set, { ...EMPTY_ANALYTICS_FILTERS, archived: "archived" }).performance.netPnl).toBe(999);
  });

  it("28. honours fee inclusion and exclusion", () => {
    const set = [rec({ netPnl: 90, grossPnl: 100, fees: 10 })];
    expect(run(set).performance.netPnl).toBe(90);
    expect(run(set, { ...EMPTY_ANALYTICS_FILTERS, excludeFees: true }).performance.netPnl).toBe(100);
  });

  it("29. aggregates the execution tape", () => {
    const tape: PositionExecution[] = [
      { id: "1", seq: 1, time: T0, kind: "open", quantity: 2, price: 100, realizedPnl: 0, realizedR: 0, remainingQuantity: 2 },
      { id: "2", seq: 2, time: T0 + 1, kind: "scale_in", quantity: 2, price: 102, realizedPnl: 0, realizedR: 0, remainingQuantity: 4 },
      { id: "3", seq: 3, time: T0 + 2, kind: "stop_move", quantity: 0, price: 99, realizedPnl: 0, realizedR: 0, remainingQuantity: 4, note: "Break-even" },
      { id: "4", seq: 4, time: T0 + 3, kind: "partial_close", quantity: 2, price: 110, realizedPnl: 18, realizedR: 0.5, remainingQuantity: 2 },
      { id: "5", seq: 5, time: T0 + 4, kind: "close", quantity: 2, price: 112, realizedPnl: 22, realizedR: 0.6, remainingQuantity: 0 },
    ];
    const s = summarizeTape(tape);
    expect(s.present).toBe(true);
    expect(s.scaleIns).toBe(1);
    expect(s.partialExits).toBe(1);
    expect(s.breakEvenEvents).toBe(1);
    expect(s.averageEntry).toBe(101);
    expect(s.executionCount).toBe(5);
  });
});

// ── 30 Behaviour rules ──────────────────────────────────────────────────────

describe("behaviour", () => {
  it("30. fires inferred flags only when their rule matches, and exposes the rule", () => {
    const loss = rec({ tradeId: "L", netPnl: -100, riskAmount: 100, entryTime: T0, exitTime: T0 + 60_000 });
    const revenge = rec({
      tradeId: "R", netPnl: -200, riskAmount: 300,
      entryTime: T0 + 120_000, exitTime: T0 + 300_000,
    });
    const { flags, facts } = computeBehaviour([loss, revenge]);
    const flag = flags.find((f) => f.id === "revenge_trading");
    expect(flag?.count).toBe(1);
    expect(flag?.tradeIds).toEqual(["R"]);
    expect(flag?.rule).toMatch(/within 15 min/);
    // Recorded facts stay separate from inference.
    expect(facts.ruleViolationCount).toBe(0);

    const widened = rec({ fillPrice: 100, initialStop: 99, finalStop: 97 });
    expect(computeBehaviour([widened]).flags.some((f) => f.id === "stop_widening")).toBe(true);
  });
});

// ── 31–35 Edge-case datasets ────────────────────────────────────────────────

describe("edge cases", () => {
  it("31. handles empty data without fabricating zeros", () => {
    const r = run([]);
    expect(r.state).toBe("no_trades");
    expect(r.performance.tradeCount).toBe(0);
    expect(r.performance.totalR).toBeNull();
    expect(r.performance.profitFactor).toBeNull();
    expect(r.equity.points).toHaveLength(0);
    expect(r.drawdown.maxDrawdown).toBe(0);
  });

  it("32. handles a single trade", () => {
    const r = run([rec({ netPnl: 25 })]);
    expect(r.performance.tradeCount).toBe(1);
    expect(r.performance.winRate).toBe(100);
    expect(r.performance.profitFactor).toBeNull(); // no losses → not a number
    expect(r.equity.points).toHaveLength(1);
  });

  it("33. handles an all-loss dataset", () => {
    const r = run([rec({ netPnl: -10, realizedR: -1 }), rec({ netPnl: -20, realizedR: -2 })]);
    expect(r.performance.winRate).toBe(0);
    expect(r.performance.profitFactor).toBe(0);
    expect(r.drawdown.maxDrawdown).toBe(30);
  });

  it("34. handles an all-win dataset", () => {
    const r = run([rec({ netPnl: 10 }), rec({ netPnl: 20 })]);
    expect(r.performance.winRate).toBe(100);
    expect(r.drawdown.maxDrawdown).toBe(0);
    expect(r.performance.recoveryFactor).toBeNull();
  });

  it("35. handles a break-even-only dataset", () => {
    const r = run([rec({ netPnl: 0, realizedR: 0 }), rec({ netPnl: 0, realizedR: 0 })]);
    expect(r.performance.breakEvenRate).toBe(100);
    expect(r.performance.winRate).toBe(0);
    expect(r.performance.profitFactor).toBeNull();
  });
});

// ── 36–39 Cache, metadata and persistence ───────────────────────────────────

describe("cache and persistence", () => {
  it("36. invalidates the cache when trades change", () => {
    const cache = new AnalyticsCache();
    const a = dataset([rec({ tradeId: "x", netPnl: 10 })]);
    const first = runAnalyticsCached(a, EMPTY_ANALYTICS_FILTERS, {}, cache);
    expect(runAnalyticsCached(a, EMPTY_ANALYTICS_FILTERS, {}, cache)).toBe(first); // memoized

    const b = dataset([rec({ tradeId: "x", netPnl: 10 }), rec({ tradeId: "y", netPnl: 5 })]);
    const second = runAnalyticsCached(b, EMPTY_ANALYTICS_FILTERS, {}, cache);
    expect(second).not.toBe(first);
    expect(second.performance.netPnl).toBe(15);

    // A filter change is also a different key.
    expect(runAnalyticsCached(b, { ...EMPTY_ANALYTICS_FILTERS, outcome: "profit" }, {}, cache)).not.toBe(second);
  });

  it("37. invalidates when journal metadata changes", () => {
    const records = [rec({ tradeId: "x" })];
    const v1 = { ...dataset(records), journalVersion: journalVersionOf([{ id: "j1", updated_at: "2026-01-01" }]) };
    const v2 = { ...dataset(records), journalVersion: journalVersionOf([{ id: "j1", updated_at: "2026-01-02" }]) };
    expect(analyticsCacheKey(v1, EMPTY_ANALYTICS_FILTERS)).not.toBe(analyticsCacheKey(v2, EMPTY_ANALYTICS_FILTERS));
  });

  it("38. never counts a trade twice across sources", () => {
    const fromTool = rec({ tradeId: "tool", positionId: "p1", journalEntryId: "j1" });
    const fromJournal = rec({ tradeId: "journal:j1", journalEntryId: "j1", source: "journal" });
    const deduped = dedupeRecords([fromJournal, fromTool]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("position_tool");
  });

  it("39. round-trips filter state through the URL so a refresh restores it", () => {
    const filters = {
      ...EMPTY_ANALYTICS_FILTERS,
      accounts: ["acc1"], symbols: ["EUR/USD"], outcome: "loss" as const,
      from: T0, archived: "both" as const, excludeFees: true,
    };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
  });
});

// ── 40 Parity with the canonical record ─────────────────────────────────────

describe("parity with canonical records", () => {
  it("40. mirrors ClosedTrade execution facts exactly", () => {
    const trade: ClosedTrade = {
      id: "ct1", orderId: "o1", positionId: "p1", drawingId: "d1",
      symbol: "BTC/USDT", market: "crypto", direction: "buy", orderType: "market",
      requestedEntry: 100, fillPrice: 100.5, entryTime: T0,
      initialStop: 98, initialTarget: 106, finalStop: 100.5, finalTarget: 106,
      exitPrice: 104, exitTime: T0 + 7_200_000, closeReason: "take_profit",
      quantity: 2, positionSize: 201,
      grossPnl: 7, fees: 1, netPnl: 6,
      riskAmount: 5, initialRiskDistance: 2.5, realizedR: 1.2, returnPercent: 3.48,
      slippage: 0.5, executionSource: "trigger",
      createdAt: T0 - 1000, closedAt: T0 + 7_200_000,
      journalEntryId: "j9", journalStatus: "linked", source: "PositionTool",
    };
    const r = fromClosedTrade(trade, { accountId: "acc1" });

    expect(r.netPnl).toBe(trade.netPnl);
    expect(r.grossPnl).toBe(trade.grossPnl);
    expect(r.realizedR).toBe(trade.realizedR);
    expect(r.result).toBe(resultOf(trade.netPnl));
    expect(r.direction).toBe("long");
    expect(r.assetClass).toBe("crypto");
    expect(r.plannedR).toBeCloseTo(Math.abs(106 - 100.5) / Math.abs(100.5 - 98), 10);
    expect(r.journalEntryId).toBe("j9");

    // The aggregate agrees with the record it was built from.
    expect(computePerformance([r]).netPnl).toBe(trade.netPnl);
    expect(computePerformance([r]).totalR).toBe(trade.realizedR);
  });
});

// ── Extra: time analytics wiring ────────────────────────────────────────────

describe("time analytics", () => {
  it("buckets hours and weekdays in the configured timezone", () => {
    const t = timeAnalytics([rec({ entryTime: Date.UTC(2026, 0, 5, 23, 0), exitTime: Date.UTC(2026, 0, 5, 23, 30) })], {
      timezone: "Asia/Tokyo",
    });
    expect(t.hours[0].label).toBe("08:00"); // 23:00 UTC → 08:00 JST next day
    expect(t.weekdays[0].key).toBe("Tuesday");
  });
});
