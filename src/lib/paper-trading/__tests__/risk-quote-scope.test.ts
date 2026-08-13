import { describe, expect, it } from "vitest";
import { computeAccountRisk, validateNewOrder, type OpenTradeInput } from "@/lib/paper-trading/risk";

/**
 * `computeAccountRisk` / `validateNewOrder` take a `QuoteLookup` that is called
 * once per open position with that position's symbol. Callers used to pass
 * `() => livePrice` — a closure ignoring the argument — which valued every open
 * position at the price of whichever symbol was being traded.
 *
 * With gold open at 3400 and a EUR/USD order on the ticket, gold got marked at
 * 1.15: a six-figure phantom loss that wiped equity and rejected a 0.01-lot
 * order on a funded account with "Insufficient margin". These tests pin the
 * lookup's contract so a scalar can't be reintroduced.
 */

const account = {
  balance: 10_000,
  leverage: 100,
  currency: "USD",
  max_trade_risk_pct: 2,
  margin_call_level: 100,
  stop_out_level: 50,
  negative_balance_protection: true,
};

const openGold: OpenTradeInput[] = [
  { id: "t1", symbol: "XAU/USD", direction: "long", entry_price: 3400, lot_size: 0.1 },
];

const smallEurOrder = {
  symbol: "EUR/USD" as const,
  direction: "long" as const,
  entry_price: 1.15,
  lot_size: 0.01,
};

describe("QuoteLookup is per-symbol", () => {
  it("passes each open position its own symbol", () => {
    const asked: string[] = [];
    computeAccountRisk(account, openGold, (s) => { asked.push(s); return null; });
    expect(asked).toEqual(["XAU/USD"]);
  });

  it("accepts a small order on a funded account holding an unrelated position", () => {
    const v = validateNewOrder(account, openGold, smallEurOrder, (s) =>
      s === "EUR/USD" ? 1.15 : null,
    );
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("regression: a symbol-blind lookup fabricates the loss that caused the rejection", () => {
    // This is the OLD behaviour, asserted so the failure mode stays legible.
    const broken = validateNewOrder(account, openGold, smallEurOrder, () => 1.15);
    expect(broken.ok).toBe(false);
    expect(broken.errors.join(" ")).toMatch(/Insufficient margin/);

    // Same inputs, correct lookup: no phantom loss, order clears.
    const fixed = validateNewOrder(account, openGold, smallEurOrder, (s) =>
      s === "EUR/USD" ? 1.15 : null,
    );
    expect(fixed.ok).toBe(true);
  });

  it("falls back to entry price when a position has no live quote", () => {
    const risk = computeAccountRisk(account, openGold, () => null);
    expect(risk.floatingPnl).toBe(0);
    expect(risk.equity).toBe(10_000);
  });

  it("still rejects an order that genuinely exceeds free margin", () => {
    const v = validateNewOrder(
      account,
      openGold,
      { symbol: "EUR/USD", direction: "long", entry_price: 1.15, lot_size: 100 },
      (s) => (s === "EUR/USD" ? 1.15 : null),
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/Insufficient margin/);
  });
});
