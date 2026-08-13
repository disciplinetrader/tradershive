import { describe, expect, it } from "vitest";
import { resolveQuantity, riskForLot } from "@/lib/paper-trading/order-ticket";
import { lotForRisk } from "@/lib/paper-trading/calculations";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { validateNewOrder } from "@/lib/paper-trading/risk";

/**
 * Asking for a small risk on an instrument with a large `minLot` cannot be
 * honoured: `lotForRisk` clamps up to the floor, and the resulting position
 * risks far more than requested. Measured on a $10,002.42 account, 0.5% risk,
 * stop 1% away — NQ resolves to 1 lot risking $3,982.50, i.e. 39.8%.
 *
 * Two failure modes came out of that, both user-visible:
 *   • the order is rejected by the 25% hard cap, reading as an inexplicable
 *     margin error when the trader typed 0.5%;
 *   • worse, on NAS100 it is ACCEPTED at 19.9% — 40x the intended risk, with
 *     the UI previously confirming "Sized to risk 0.5%".
 *
 * These pin the arithmetic and the honest-reporting contract.
 */

const BALANCE = 10_002.42;
const account = {
  balance: BALANCE, leverage: 100, currency: "USD", max_trade_risk_pct: 2,
  margin_call_level: 100, stop_out_level: 50, negative_balance_protection: true,
};

function size(symbol: string, pct: number) {
  const sym = findSymbol(symbol)!;
  const entry = sym.refPrice;
  const sl = entry * 0.99;
  return { sym, entry, sl, r: resolveQuantity({ mode: "risk_percent", sym, entry, sl, balance: BALANCE, value: pct }) };
}

describe("min-lot risk inflation", () => {
  it("flags the clamp and reports the risk actually carried, not the request", () => {
    const { r } = size("NQ", 0.5);
    expect(r.clamped).toBe("min");
    expect(r.lot).toBe(1);
    expect(r.requestedRisk).toBeCloseTo(BALANCE * 0.005, 2);
    expect(r.actualRisk).toBeCloseTo(3982.5, 2);
    // The reported figure must be the real one, ~80x the request.
    expect(r.actualRisk! / r.requestedRisk!).toBeGreaterThan(70);
  });

  it("the clamped size is what trips the hard risk cap", () => {
    const { sym, entry, sl, r } = size("NQ", 0.5);
    const v = validateNewOrder(account, [], {
      symbol: sym.symbol, direction: "long", entry_price: entry,
      lot_size: r.lot!, stop_loss: sl,
    }, (s) => (s === sym.symbol ? entry : null));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/exceeds absolute cap/);
  });

  it("catches the silent case too — accepted, but far above the request", () => {
    const { r } = size("NAS100", 0.5);
    expect(r.clamped).toBe("min");
    const actualPct = (r.actualRisk! / BALANCE) * 100;
    expect(actualPct).toBeGreaterThan(19);   // asked 0.5%
  });

  it("leaves symbols with a fine lot step alone", () => {
    const { r } = size("EUR/USD", 0.5);
    expect(r.clamped).not.toBe("min");
    const actualPct = (r.actualRisk! / BALANCE) * 100;
    expect(actualPct).toBeGreaterThan(0.4);
    expect(actualPct).toBeLessThan(0.6);
  });

  it("actualRisk agrees with riskForLot on the lot that gets sent", () => {
    const { sym, entry, sl, r } = size("ES", 0.5);
    expect(r.actualRisk).toBeCloseTo(riskForLot(sym, entry, sl, r.lot!), 6);
    expect(r.lot).toBe(lotForRisk(sym, entry, sl, r.requestedRisk!));
  });
});
