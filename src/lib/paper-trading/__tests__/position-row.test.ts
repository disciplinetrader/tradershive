import { describe, it, expect } from "vitest";
import { derivePositionRow, type Trade } from "../position-row";
import { findSymbol } from "../symbols";

/**
 * The figures the Positions table shows for an open trade.
 *
 * These are the numbers a trader sizes the next order against, and every one of
 * them fails quietly: a margin taken at the wrong leverage, or a percentage
 * struck against notional instead of margin, still renders as a believable
 * number on a row nobody reconciles against a broker statement.
 */

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    symbol: "EUR/USD",
    direction: "long",
    entry_price: 1.1,
    lot_size: 1,
    stop_loss: null,
    take_profit: null,
    opened_at: new Date().toISOString(),
    commission: 0,
    swap: 0,
    account_id: "a1",
    notes: null,
    ...over,
  };
}

describe("derivePositionRow", () => {
  it("values one standard forex lot at its notional, and margins it at account leverage", () => {
    const r = derivePositionRow(trade(), { current: 1.1, accountLeverage: 100 });

    // 100,000 units × 1.10
    expect(r.tradeValue).toBeCloseTo(110_000, 6);
    expect(r.marketValue).toBeCloseTo(110_000, 6);
    expect(r.margin).toBeCloseTo(1_100, 6);
    // Effective gearing is the account's leverage when nothing else constrains
    // the position.
    expect(r.leverage).toBeCloseTo(100, 6);
  });

  it("moves market value with price while margin stays struck at entry", () => {
    const r = derivePositionRow(trade(), { current: 1.2, accountLeverage: 100 });

    expect(r.tradeValue).toBeCloseTo(110_000, 6);
    expect(r.marketValue).toBeCloseTo(120_000, 6);
    // The whole point: margin does NOT follow the market.
    expect(r.margin).toBeCloseTo(1_100, 6);
  });

  it("expresses P/L as a percentage of margin, not of notional", () => {
    const r = derivePositionRow(trade(), { current: 1.11, accountLeverage: 100 });

    // +0.01 on 100,000 units = +$1,000 against $1,100 of margin.
    expect(r.floating).toBeCloseTo(1_000, 6);
    expect(r.pnlPct).toBeCloseTo((1_000 / 1_100) * 100, 6);
    // Against notional it would read 0.91% — a tenth of the truth, and the
    // difference between "this position is working" and "this is noise".
    expect(r.pnlPct).not.toBeCloseTo((1_000 / 110_000) * 100, 2);
  });

  it("scales margin down with leverage", () => {
    const low = derivePositionRow(trade(), { current: 1.1, accountLeverage: 10 });
    const high = derivePositionRow(trade(), { current: 1.1, accountLeverage: 500 });

    expect(low.margin).toBeCloseTo(11_000, 6);
    expect(high.margin).toBeCloseTo(220, 6);
    expect(low.leverage).toBeCloseTo(10, 6);
    expect(high.leverage).toBeCloseTo(500, 6);
  });

  it("returns nulls rather than zeros when there is no quote", () => {
    const r = derivePositionRow(trade(), { current: null, accountLeverage: 100 });

    expect(r.current).toBeNull();
    expect(r.floating).toBeNull();
    expect(r.marketValue).toBeNull();
    expect(r.pnlPct).toBeNull();
    // Entry-side figures do not depend on a quote, so they still resolve.
    expect(r.tradeValue).toBeCloseTo(110_000, 6);
    expect(r.margin).toBeCloseTo(1_100, 6);
  });

  it("returns null margin — not Infinity — when the account has no leverage", () => {
    const r = derivePositionRow(trade(), { current: 1.1, accountLeverage: 0 });

    expect(r.margin).toBeNull();
    expect(r.pnlPct).toBeNull();
    expect(r.leverage).toBeNull();
  });

  it("distinguishes an unmeasurable R from a real 0.00R", () => {
    const noStop = derivePositionRow(trade(), { current: 1.11, accountLeverage: 100 });
    expect(noStop.rr).toBeNull();

    // Stop set, price back at entry: R is genuinely zero, and that is not the
    // same statement as "no stop set".
    const flat = derivePositionRow(trade({ stop_loss: 1.09 }), {
      current: 1.1, accountLeverage: 100,
    });
    expect(flat.rr).toBe(0);
  });

  it("computes crypto from its own contract size, not forex's", () => {
    const sym = findSymbol("BTC/USDT")!;
    expect(sym.contractSize).toBe(1);

    const r = derivePositionRow(
      trade({ symbol: "BTC/USDT", entry_price: 60_000, lot_size: 0.5 }),
      { current: 61_000, accountLeverage: 100 },
    );

    expect(r.tradeValue).toBeCloseTo(30_000, 6);
    expect(r.marketValue).toBeCloseTo(30_500, 6);
    expect(r.margin).toBeCloseTo(300, 6);
    expect(r.floating).toBeCloseTo(500, 6);
  });

  it("yields no derived figures for a symbol outside the catalog", () => {
    const r = derivePositionRow(trade({ symbol: "NOT/REAL" }), {
      current: 5, accountLeverage: 100,
    });

    expect(r.sym).toBeUndefined();
    expect(r.tradeValue).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.floating).toBeNull();
  });
});
