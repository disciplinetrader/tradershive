import { describe, it, expect } from "vitest";
import {
  classifyOutcome, filterTrades, hasActiveFilters,
  statsFiltersFromSearch, statsFiltersToSearch,
} from "../filters";
import { EMPTY_FILTERS } from "../types";
import type { AnalyticsTrade, StatisticsFilters } from "../types";

/**
 * Analytics filters — asserted on the DATASET, never on the controls.
 *
 * The failure this suite exists to catch is a filter that renders, looks
 * active, and narrows nothing. From the control that is indistinguishable from
 * a working filter, and the same shape has shipped repeatedly in this project:
 * `StatisticsFilters.tags` is declared and never read to this day.
 *
 * So every case asserts WHICH trades survive, by id and by count, and every
 * narrowing case is paired with one that matches everything and one that
 * matches nothing — a predicate stuck on `true` passes none of these, and a
 * predicate stuck on `false` passes none either.
 *
 * Timestamps are local-time constructions on purpose: day-of-week and
 * hour-of-day read local time, and building the fixtures the same way is what
 * makes the expectations checkable by hand rather than dependent on the box's
 * offset.
 */

function at(y: number, m: number, d: number, h: number): string {
  return new Date(y, m - 1, d, h, 0, 0).toISOString();
}

function trade(over: Partial<AnalyticsTrade> & { id: string }): AnalyticsTrade {
  return {
    source: "paper",
    trade_id: null,
    account_id: "a1",
    symbol: "EUR/USD",
    market: "forex",
    direction: "long",
    entry_price: 1, exit_price: 1, stop_loss: null, take_profit: null,
    lot_size: 1, rr: null, risk_pct: null,
    pnl: 0, commission: 0, swap: 0,
    opened_at: at(2026, 6, 1, 9),
    closed_at: at(2026, 6, 1, 10),
    duration_seconds: 3600,
    session: null, setup: null, strategy: null,
    emotions: [], mistakes: [], grade: null, status: "closed",
    ...over,
  } as AnalyticsTrade;
}

const f = (over: Partial<StatisticsFilters> = {}): StatisticsFilters => ({ ...EMPTY_FILTERS, ...over });
const ids = (ts: AnalyticsTrade[]) => ts.map((t) => t.id).sort();

/* ═══════════════════════════════════════════════════════════════════
   Outcome
   ═══════════════════════════════════════════════════════════════════ */

describe("outcome", () => {
  // 2026-06-01 is a Monday.
  const set = [
    trade({ id: "win", pnl: 120 }),
    trade({ id: "loss", pnl: -80 }),
    trade({ id: "flat", pnl: 0 }),
    trade({ id: "tiny", pnl: 3 }),
    trade({ id: "tinyloss", pnl: -3 }),
  ];

  it("classifies against the threshold, and 0 means exactly flat", () => {
    expect(classifyOutcome(120, 0)).toBe("win");
    expect(classifyOutcome(-80, 0)).toBe("loss");
    expect(classifyOutcome(0, 0)).toBe("breakeven");
    // At the default threshold a $3 win is a WIN, not breakeven. That is the
    // strictness the default buys, and the reason the control exists.
    expect(classifyOutcome(3, 0)).toBe("win");
    expect(classifyOutcome(3, 5)).toBe("breakeven");
    expect(classifyOutcome(-3, 5)).toBe("breakeven");
  });

  it("narrows to wins, and the threshold MOVES a trade between buckets", () => {
    expect(ids(filterTrades(set, f({ outcome: "win" })))).toEqual(["tiny", "win"]);
    // Same filter, threshold raised: the $3 win becomes breakeven and leaves.
    expect(ids(filterTrades(set, f({ outcome: "win", breakevenThreshold: 5 })))).toEqual(["win"]);
    expect(ids(filterTrades(set, f({ outcome: "breakeven", breakevenThreshold: 5 }))))
      .toEqual(["flat", "tiny", "tinyloss"]);
  });

  it("narrows to losses", () => {
    expect(ids(filterTrades(set, f({ outcome: "loss" })))).toEqual(["loss", "tinyloss"]);
  });

  it("`all` disables the filter rather than being a fourth bucket", () => {
    expect(filterTrades(set, f({ outcome: "all" }))).toHaveLength(5);
    expect(filterTrades(set, f())).toHaveLength(5);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Day of week
   ═══════════════════════════════════════════════════════════════════ */

describe("day of week", () => {
  // 2026-06-01 Mon (1) … 2026-06-06 Sat (6), 2026-06-07 Sun (0).
  const set = [
    trade({ id: "mon", closed_at: at(2026, 6, 1, 10) }),
    trade({ id: "wed", closed_at: at(2026, 6, 3, 10) }),
    trade({ id: "sat", closed_at: at(2026, 6, 6, 10) }),
    trade({ id: "sun", closed_at: at(2026, 6, 7, 10) }),
  ];

  it("selects only the chosen days", () => {
    expect(ids(filterTrades(set, f({ days: [1] })))).toEqual(["mon"]);
    expect(ids(filterTrades(set, f({ days: [0, 6] })))).toEqual(["sat", "sun"]);
  });

  it("empty means every day, and an unmatched day means none", () => {
    expect(filterTrades(set, f({ days: [] }))).toHaveLength(4);
    expect(filterTrades(set, f({ days: [2] }))).toHaveLength(0);
  });

  it("reads the SAME anchor as the date filter — closed_at, else opened_at", () => {
    // Opened Sunday, closed Monday. The trade belongs to Monday, because that
    // is the anchor every other date-shaped filter uses. Two date filters
    // disagreeing about which timestamp they mean is its own bug.
    const overnight = [trade({ id: "x", opened_at: at(2026, 6, 7, 23), closed_at: at(2026, 6, 1, 1) })];
    expect(ids(filterTrades(overnight, f({ days: [1] })))).toEqual(["x"]);
    expect(filterTrades(overnight, f({ days: [0] }))).toHaveLength(0);

    // With no close, it falls back to the open.
    const open = [trade({ id: "y", opened_at: at(2026, 6, 7, 23), closed_at: null })];
    expect(ids(filterTrades(open, f({ days: [0] })))).toEqual(["y"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Hour of day
   ═══════════════════════════════════════════════════════════════════ */

describe("hour of day", () => {
  const set = [
    trade({ id: "h02", closed_at: at(2026, 6, 1, 2) }),
    trade({ id: "h09", closed_at: at(2026, 6, 1, 9) }),
    trade({ id: "h14", closed_at: at(2026, 6, 1, 14) }),
    trade({ id: "h23", closed_at: at(2026, 6, 1, 23) }),
  ];

  it("includes both boundaries", () => {
    expect(ids(filterTrades(set, f({ hourFrom: 9, hourTo: 14 })))).toEqual(["h09", "h14"]);
  });

  it("treats a window that wraps midnight as a union, not an empty range", () => {
    // 22:00 -> 04:00 is a real overnight session. Naive `h >= from && h <= to`
    // returns NOTHING for it, which is the bug this case exists for.
    expect(ids(filterTrades(set, f({ hourFrom: 22, hourTo: 4 })))).toEqual(["h02", "h23"]);
  });

  it("supports an open-ended bound on either side", () => {
    expect(ids(filterTrades(set, f({ hourFrom: 14, hourTo: null })))).toEqual(["h14", "h23"]);
    expect(ids(filterTrades(set, f({ hourFrom: null, hourTo: 9 })))).toEqual(["h02", "h09"]);
  });

  it("unbounded means every hour", () => {
    expect(filterTrades(set, f({ hourFrom: null, hourTo: null }))).toHaveLength(4);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Combination — filters must AND, not replace one another
   ═══════════════════════════════════════════════════════════════════ */

describe("filters combine", () => {
  const set = [
    trade({ id: "keep", pnl: -50, direction: "short", closed_at: at(2026, 6, 3, 10) }),
    trade({ id: "wrongOutcome", pnl: 50, direction: "short", closed_at: at(2026, 6, 3, 10) }),
    trade({ id: "wrongSide", pnl: -50, direction: "long", closed_at: at(2026, 6, 3, 10) }),
    trade({ id: "wrongDay", pnl: -50, direction: "short", closed_at: at(2026, 6, 6, 10) }),
    trade({ id: "wrongHour", pnl: -50, direction: "short", closed_at: at(2026, 6, 3, 20) }),
  ];

  it("every dimension narrows, and only the trade matching all survives", () => {
    const res = filterTrades(set, f({
      outcome: "loss", directions: ["short"], days: [3], hourFrom: 8, hourTo: 12,
    }));
    expect(ids(res)).toEqual(["keep"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   URL round-trip
   ═══════════════════════════════════════════════════════════════════ */

describe("search-param round trip", () => {
  it("survives a round trip with every new dimension set", () => {
    const original = f({
      outcome: "loss", breakevenThreshold: 2.5, days: [1, 3, 5],
      hourFrom: 7, hourTo: 16, symbols: ["EUR/USD", "GBP/USD"], directions: ["short"],
    });
    const back = statsFiltersFromSearch(statsFiltersToSearch(original));
    expect(back.outcome).toBe("loss");
    expect(back.breakevenThreshold).toBe(2.5);
    expect(back.days).toEqual([1, 3, 5]);
    expect(back.hourFrom).toBe(7);
    expect(back.hourTo).toBe(16);
    expect(back.symbols).toEqual(["EUR/USD", "GBP/USD"]);
    expect(back.directions).toEqual(["short"]);
  });

  it("omits defaults so a clean view has a clean URL", () => {
    expect(statsFiltersToSearch(EMPTY_FILTERS)).toEqual({});
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(f({ outcome: "win" }))).toBe(true);
  });

  it("rejects junk from a hand-edited URL rather than trusting it", () => {
    const bad = statsFiltersFromSearch({ outcome: "banana", hf: "99", ht: "-4", days: "9,x,2", be: "-5" });
    expect(bad.outcome).toBe("all");
    expect(bad.hourFrom).toBeNull();
    expect(bad.hourTo).toBeNull();
    expect(bad.days).toEqual([2]);
    expect(bad.breakevenThreshold).toBe(0);
  });

  it("a round trip through the URL produces the SAME filtered set", () => {
    // The assertion that matters: the encoding is only correct if the data it
    // reproduces is identical. Field equality could pass while a dropped key
    // silently widened the result.
    const set = [
      trade({ id: "a", pnl: -10, closed_at: at(2026, 6, 3, 9) }),
      trade({ id: "b", pnl: 10, closed_at: at(2026, 6, 3, 9) }),
      trade({ id: "c", pnl: -10, closed_at: at(2026, 6, 6, 9) }),
    ];
    const original = f({ outcome: "loss", days: [3], hourFrom: 8, hourTo: 12 });
    const restored = statsFiltersFromSearch(statsFiltersToSearch(original));
    expect(ids(filterTrades(set, restored))).toEqual(ids(filterTrades(set, original)));
    expect(ids(filterTrades(set, restored))).toEqual(["a"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Regression: router-coerced search values, and hour partitioning
   ═══════════════════════════════════════════════════════════════════ */

describe("search values the router has coerced", () => {
  it("reads a bare numeric list value — `?days=1` arrives as a NUMBER", () => {
    // Found in a browser: the chip for Day never rendered because `days=1`
    // reached the parser as 1, not "1", and a string-only reader returned [].
    // The filter was in the URL, the data was unfiltered, and nothing said so.
    expect(statsFiltersFromSearch({ days: 1 }).days).toEqual([1]);
    expect(statsFiltersFromSearch({ days: "1" }).days).toEqual([1]);
    expect(statsFiltersFromSearch({ days: "1,3" }).days).toEqual([1, 3]);
    expect(statsFiltersFromSearch({ days: [1, 3] }).days).toEqual([1, 3]);
  });

  it("applies a coerced day filter to the data, not just to the parse", () => {
    const set = [
      trade({ id: "mon", closed_at: at(2026, 6, 1, 10) }),
      trade({ id: "wed", closed_at: at(2026, 6, 3, 10) }),
    ];
    expect(ids(filterTrades(set, statsFiltersFromSearch({ days: 1 })))).toEqual(["mon"]);
  });

  it("undoes the router's JSON encoding — the round-trip bug", () => {
    // The router re-encodes what it writes, so a value this module serialised
    // as `days=1` returns as the STRING `"1"`, quotes included. Splitting that
    // gives ['"1"'] and Number() gives NaN, so the filter vanishes. A
    // hand-written URL works, which is why it survived until a chip was
    // removed and the surviving filters were rewritten and re-read.
    expect(statsFiltersFromSearch({ days: '"1"' }).days).toEqual([1]);
    expect(statsFiltersFromSearch({ days: '"1,3"' }).days).toEqual([1, 3]);
    expect(statsFiltersFromSearch({ outcome: '"win"' }).outcome).toBe("win");
    expect(statsFiltersFromSearch({ sym: '"EUR/USD,GBP/USD"' }).symbols).toEqual(["EUR/USD", "GBP/USD"]);
    expect(statsFiltersFromSearch({ hf: '"8"' }).hourFrom).toBe(8);
  });

  it("survives a full write -> encode -> read cycle", () => {
    const original = f({ outcome: "loss", days: [1, 5], hourFrom: 9, hourTo: 17 });
    // Simulate the router: JSON-encode every value it writes.
    const encoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(statsFiltersToSearch(original))) encoded[k] = JSON.stringify(v);
    const back = statsFiltersFromSearch(encoded);
    expect(back.outcome).toBe("loss");
    expect(back.days).toEqual([1, 5]);
    expect(back.hourFrom).toBe(9);
    expect(back.hourTo).toBe(17);
  });

  it("reads coerced numeric scalars for the other keys too", () => {
    const f2 = statsFiltersFromSearch({ hf: 8, ht: 12, be: 2.5 });
    expect(f2.hourFrom).toBe(8);
    expect(f2.hourTo).toBe(12);
    expect(f2.breakevenThreshold).toBe(2.5);
    expect(statsFiltersFromSearch({ sym: "EUR/USD" }).symbols).toEqual(["EUR/USD"]);
  });
});

describe("hour windows partition the dataset", () => {
  const set = [
    trade({ id: "h03", closed_at: at(2026, 6, 1, 3) }),
    trade({ id: "h09", closed_at: at(2026, 6, 1, 9) }),
    trade({ id: "h23", closed_at: at(2026, 6, 1, 23) }),
  ];

  it("an hour and its complement cover the whole set exactly once", () => {
    const only3 = filterTrades(set, f({ hourFrom: 3, hourTo: 3 }));
    const not3 = filterTrades(set, f({ hourFrom: 4, hourTo: 2 }));
    expect(ids(only3)).toEqual(["h03"]);
    expect(ids(not3)).toEqual(["h09", "h23"]);
    expect(only3.length + not3.length).toBe(set.length);
  });

  it("a trade with an UNPARSEABLE anchor falls out of BOTH windows", () => {
    // Worth asserting rather than discovering: `new Date("nonsense").getHours()`
    // is NaN, and every NaN comparison is false, so such a trade matches no
    // hour window at all. It is excluded, not defaulted into one — which is the
    // honest behaviour, but it means an hour filter and its complement do NOT
    // add up to the unfiltered total when the data contains bad dates.
    const bad = [...set, trade({ id: "junk", closed_at: "not-a-date" })];
    const only3 = filterTrades(bad, f({ hourFrom: 3, hourTo: 3 }));
    const not3 = filterTrades(bad, f({ hourFrom: 4, hourTo: 2 }));
    expect(ids(only3)).toEqual(["h03"]);
    expect(ids(not3)).toEqual(["h09", "h23"]);
    expect(only3.length + not3.length).toBe(bad.length - 1);
  });
});
