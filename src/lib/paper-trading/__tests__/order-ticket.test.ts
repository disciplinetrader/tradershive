import { describe, expect, it } from "vitest";
import {
  resolveQuantity,
  targetPriceForReward,
  rewardForTargetPrice,
  riskForLot,
} from "@/lib/paper-trading/order-ticket";
import { findSymbol } from "@/lib/paper-trading/symbols";

// EUR/USD: pip 0.0001, $10 per pip per lot, lot step 0.01, min 0.01, max 100.
const eur = findSymbol("EUR/USD")!;
// BTC/USDT: pip 1.0, $1 per pip per lot, lot step 0.001, min 0.001.
const btc = findSymbol("BTC/USDT")!;

describe("resolveQuantity — units mode", () => {
  it("passes the lot through and reports the risk it carries", () => {
    const r = resolveQuantity({
      mode: "units", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 0.5,
    });
    expect(r.lot).toBe(0.5);
    // 100 pips × $10 × 0.5 lot = $500
    expect(r.actualRisk).toBeCloseTo(500, 6);
    expect(r.error).toBeNull();
  });

  it("reports no risk when there is no stop, rather than guessing one", () => {
    const r = resolveQuantity({
      mode: "units", sym: eur, entry: 1.1, sl: null, balance: 10_000, value: 0.5,
    });
    expect(r.lot).toBe(0.5);
    expect(r.actualRisk).toBeNull();
  });

  it("rejects a non-positive lot", () => {
    const r = resolveQuantity({
      mode: "units", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 0,
    });
    expect(r.lot).toBeNull();
    expect(r.error).toMatch(/positive/i);
  });
});

describe("resolveQuantity — risk in currency", () => {
  it("sizes backward from the stop distance", () => {
    // Want to lose $500 over a 100-pip stop at $10/pip/lot → 0.50 lots.
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 500,
    });
    expect(r.lot).toBeCloseTo(0.5, 6);
    expect(r.requestedRisk).toBe(500);
    expect(r.actualRisk).toBeCloseTo(500, 6);
    expect(r.clamped).toBeNull();
  });

  it("a tighter stop buys a bigger position for the same risk", () => {
    const wide = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 500,
    });
    const tight = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.095, balance: 10_000, value: 500,
    });
    expect(tight.lot!).toBeGreaterThan(wide.lot!);
    // …and both still risk the same money, which is the whole point.
    expect(tight.actualRisk).toBeCloseTo(wide.actualRisk!, 6);
  });

  it("works on a symbol whose pip is a whole unit", () => {
    // BTC: stop 500 "pips" away, $1/pip/lot → $250 risk wants 0.5 lots.
    const r = resolveQuantity({
      mode: "risk_currency", sym: btc, entry: 67_500, sl: 67_000, balance: 50_000, value: 250,
    });
    expect(r.lot).toBeCloseTo(0.5, 6);
    expect(r.actualRisk).toBeCloseTo(250, 6);
  });

  it("refuses without a stop loss instead of inventing a size", () => {
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: null, balance: 10_000, value: 500,
    });
    expect(r.lot).toBeNull();
    expect(r.error).toMatch(/stop loss/i);
  });

  it("refuses when the stop sits on the entry", () => {
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.1, balance: 10_000, value: 500,
    });
    expect(r.lot).toBeNull();
    expect(r.error).toMatch(/different price/i);
  });
});

describe("resolveQuantity — risk as a percent of balance", () => {
  it("reads the percent off the account balance", () => {
    // 1% of $50,000 = $500 → same 0.50 lots as the currency case above.
    const r = resolveQuantity({
      mode: "risk_percent", sym: eur, entry: 1.1, sl: 1.09, balance: 50_000, value: 1,
    });
    expect(r.requestedRisk).toBe(500);
    expect(r.lot).toBeCloseTo(0.5, 6);
  });

  it("refuses on a zero balance rather than sizing to nothing", () => {
    const r = resolveQuantity({
      mode: "risk_percent", sym: eur, entry: 1.1, sl: 1.09, balance: 0, value: 1,
    });
    expect(r.lot).toBeNull();
    expect(r.error).toMatch(/balance/i);
  });
});

describe("resolveQuantity — the risk actually taken, not the risk asked for", () => {
  it("flags the minimum-lot floor, where real risk exceeds the request", () => {
    // $1 of risk over a 100-pip stop wants 0.001 lots; EUR/USD floors at 0.01.
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 1,
    });
    expect(r.clamped).toBe("min");
    expect(r.lot).toBe(0.01);
    // The honest number: 0.01 lots over 100 pips is $10, not the $1 requested.
    expect(r.actualRisk).toBeCloseTo(10, 6);
    expect(r.actualRisk!).toBeGreaterThan(r.requestedRisk!);
  });

  it("flags lot-step rounding", () => {
    // $333 over 100 pips = 0.333 lots, snapped to 0.33 by the 0.01 step.
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 333,
    });
    expect(r.clamped).toBe("step");
    expect(r.lot).toBeCloseTo(0.33, 6);
    expect(r.actualRisk).toBeCloseTo(330, 6);
  });

  it("never reports actualRisk equal to a request it could not honour", () => {
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 1,
    });
    expect(r.actualRisk).not.toBe(r.requestedRisk);
  });
});

describe("targetPriceForReward", () => {
  it("places a long's target above entry", () => {
    // 0.5 lots at $10/pip = $5/pip; $500 of reward is 100 pips → 1.11.
    const px = targetPriceForReward({
      sym: eur, side: "long", entry: 1.1, lot: 0.5, balance: 10_000,
      mode: "reward_currency", value: 500,
    });
    expect(px).toBeCloseTo(1.11, 6);
  });

  it("places a short's target below entry", () => {
    const px = targetPriceForReward({
      sym: eur, side: "short", entry: 1.1, lot: 0.5, balance: 10_000,
      mode: "reward_currency", value: 500,
    });
    expect(px).toBeCloseTo(1.09, 6);
  });

  it("reads a percent off the balance", () => {
    const px = targetPriceForReward({
      sym: eur, side: "long", entry: 1.1, lot: 0.5, balance: 50_000,
      mode: "reward_percent", value: 1,
    });
    expect(px).toBeCloseTo(1.11, 6);
  });

  it("returns null without a lot size — a reward is not a price on its own", () => {
    expect(targetPriceForReward({
      sym: eur, side: "long", entry: 1.1, lot: null, balance: 10_000,
      mode: "reward_currency", value: 500,
    })).toBeNull();
  });

  it("returns null in price mode, which owns its own field", () => {
    expect(targetPriceForReward({
      sym: eur, side: "long", entry: 1.1, lot: 0.5, balance: 10_000,
      mode: "price", value: 500,
    })).toBeNull();
  });

  it("round-trips against rewardForTargetPrice", () => {
    const px = targetPriceForReward({
      sym: eur, side: "long", entry: 1.1, lot: 0.5, balance: 10_000,
      mode: "reward_currency", value: 500,
    })!;
    expect(rewardForTargetPrice(eur, "long", 1.1, px, 0.5)).toBeCloseTo(500, 4);
  });

  it("signs the reward negative when the target is the wrong side of entry", () => {
    // A "target" below entry on a long is a loss, and must not read as a gain.
    expect(rewardForTargetPrice(eur, "long", 1.1, 1.09, 0.5)).toBeCloseTo(-500, 4);
  });
});

describe("riskForLot", () => {
  it("is the inverse of risk-based sizing", () => {
    const r = resolveQuantity({
      mode: "risk_currency", sym: eur, entry: 1.1, sl: 1.09, balance: 10_000, value: 500,
    });
    expect(riskForLot(eur, 1.1, 1.09, r.lot!)).toBeCloseTo(500, 6);
  });
});
