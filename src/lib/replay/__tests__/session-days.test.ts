import { describe, it, expect } from "vitest";
import { buildSessionSummary } from "../review/summary";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";

/**
 * Per-market-day P/L on a replay session.
 *
 * The grouping is `groupBy` + `dayKey` from the shared engine — this asserts
 * the two decisions layered on top: which day a trade belongs to, and that a
 * day is reported from its first trade rather than withheld for sample size.
 */

let seq = 0;
function trade(exitISO: string, netPnl: number): ClosedTrade {
  seq += 1;
  const exitTime = Date.parse(exitISO);
  return {
    id: `t${seq}`,
    orderId: `o${seq}`,
    symbol: "BTC/USDT",
    direction: netPnl >= 0 ? "buy" : "sell",
    quantity: 1,
    fillPrice: 100,
    exitPrice: 100 + netPnl,
    netPnl,
    grossPnl: netPnl,
    fees: 0,
    realizedR: null,
    riskBasis: null,
    entryTime: exitTime - 60_000,
    exitTime,
    closeReason: "manual",
    market: "crypto",
  } as unknown as ClosedTrade;
}

const build = (trades: ClosedTrade[]) =>
  buildSessionSummary({ sessionId: "s1", symbol: "BTC/USDT", startingBalance: 10_000, trades });

describe("session day P/L", () => {
  it("groups by market day and sums each day's net P/L", () => {
    const s = build([
      trade("2026-07-05T04:00:00Z", 100),
      trade("2026-07-05T22:00:00Z", -30),
      trade("2026-07-06T09:00:00Z", 50),
    ]);
    expect(s.days.map((d) => [d.key, d.netPnl, d.count])).toEqual([
      ["2026-07-05", 70, 2],
      ["2026-07-06", 50, 1],
    ]);
  });

  it("returns days oldest first, so the strip reads left to right", () => {
    const s = build([
      trade("2026-07-07T10:00:00Z", 10),
      trade("2026-07-05T10:00:00Z", 10),
      trade("2026-07-06T10:00:00Z", 10),
    ]);
    expect(s.days.map((d) => d.key)).toEqual(["2026-07-05", "2026-07-06", "2026-07-07"]);
  });

  it("anchors on UTC, so a late-evening trade does not slide into tomorrow", () => {
    // 23:30 UTC is already the next day in Tokyo and still today in New York.
    // These are historical bars: the day they belong to is a market fact.
    const s = build([trade("2026-07-05T23:30:00Z", 25)]);
    expect(s.days[0].key).toBe("2026-07-05");
  });

  it("reports a day from its very first trade", () => {
    // Unlike a setup cohort, a day has nothing to be ranked against — hiding
    // it at n=1 would conceal the session's own history rather than protect a
    // claim about it.
    const s = build([trade("2026-07-05T10:00:00Z", -12.5)]);
    expect(s.days).toHaveLength(1);
    expect(s.days[0].netPnl).toBe(-12.5);
  });

  it("is empty when nothing closed, rather than a zero-P/L day", () => {
    expect(build([]).days).toEqual([]);
  });
});
