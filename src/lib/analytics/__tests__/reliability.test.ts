import { describe, it, expect } from "vitest";
import { computePerformance } from "../expectancy";
import { MIN_SAMPLE, measurableRate } from "../measurable";
import type { AnalyticsRecord } from "../model";

/**
 * The reliability gate on rate-style metrics.
 *
 * The bug it closes: a two-trade session reported a win rate as flatly as a
 * two-hundred-trade one. The number was never wrong — it was unsupported, and
 * nothing said so.
 */

let seq = 0;
function rec(result: "win" | "loss" | "breakeven", pnl: number): AnalyticsRecord {
  seq += 1;
  return {
    tradeId: `t${seq}`,
    symbol: "BTC/USDT",
    result,
    netPnl: pnl,
    grossPnl: pnl,
    fees: 0,
    realizedR: null,
    exitTime: 1_800_000_000_000 + seq * 60_000,
    duration: 60,
    quantity: 1,
    journal: {},
  } as unknown as AnalyticsRecord;
}

const wins = (n: number) => Array.from({ length: n }, () => rec("win", 100));

describe("computePerformance().reliability", () => {
  it("refuses a win rate below the sample floor, and says what is missing", () => {
    const perf = computePerformance([rec("win", 100), rec("loss", -50)]);
    // The number itself is still computed and still correct.
    expect(perf.winRate).toBe(50);
    // But it is not licensed.
    expect(perf.reliability.measurable).toBe(false);
    if (!perf.reliability.measurable) {
      expect(perf.reliability.reason).toBe(`Needs ${MIN_SAMPLE} trades, has 2`);
    }
    expect(perf.reliability.sample).toBe(2);
  });

  it("licenses it at exactly the floor", () => {
    const perf = computePerformance(wins(MIN_SAMPLE));
    expect(perf.reliability.measurable).toBe(true);
    expect(perf.reliability.sample).toBe(MIN_SAMPLE);
    if (perf.reliability.measurable) expect(perf.reliability.value).toBe(100);
  });

  it("is the guard against '100% win rate (1 trade)'", () => {
    const perf = computePerformance([rec("win", 100)]);
    expect(perf.winRate).toBe(100);
    expect(perf.reliability.measurable).toBe(false);
  });

  it("counts DECIDED trades — break-evens do not license a win rate", () => {
    // Twenty scratches and one winner is still a one-trade sample for a rate.
    const records = [rec("win", 100), ...Array.from({ length: 20 }, () => rec("breakeven", 0))];
    const perf = computePerformance(records);
    expect(perf.tradeCount).toBe(21);
    expect(perf.reliability.sample).toBe(1);
    expect(perf.reliability.measurable).toBe(false);
  });

  it("reports an empty dataset as no trades, not as a failed threshold", () => {
    const perf = computePerformance([]);
    expect(perf.reliability.measurable).toBe(false);
    if (!perf.reliability.measurable) expect(perf.reliability.reason).toBe("No trades in range");
  });

  it("leaves every other metric untouched", () => {
    // The gate must not alter what it gates, or it becomes a second formula.
    const records = [rec("win", 100), rec("loss", -50)];
    const perf = computePerformance(records);
    expect(perf.netPnl).toBe(50);
    expect(perf.winRate).toBe(50);
    expect(perf.expectancy).toBe(25);
    expect(perf.profitFactor).toBe(2);
  });
});

describe("measurableRate — one shape, shared", () => {
  it("is the same helper the journal's six reports already use", () => {
    // Promoted from journal/reports.ts rather than reimplemented, so the two
    // surfaces cannot drift into different definitions of "enough trades".
    expect(measurableRate(4, 75)).toEqual({
      measurable: false, reason: `Needs ${MIN_SAMPLE} trades, has 4`, sample: 4,
    });
    expect(measurableRate(5, 75)).toEqual({ measurable: true, value: 75, sample: 5 });
  });

  it("accepts a caller-supplied floor for cohorts that need a different one", () => {
    expect(measurableRate(4, 75, 3).measurable).toBe(true);
  });
});
