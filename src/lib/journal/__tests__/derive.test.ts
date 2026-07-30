import { describe, expect, it } from "vitest";
import { deriveTrade, derivedPatch, resultOf, feesOf } from "@/lib/journal/derive";
import type { JournalEntry } from "@/lib/journal/api";

const base = (over: Partial<JournalEntry> = {}) =>
  ({
    id: "e1",
    pnl: null,
    commission: null,
    swap: null,
    entry_price: null,
    stop_loss: null,
    lot_size: null,
    risk_pct: null,
    rr: null,
    narrative: {},
    field_sources: {},
    trade_id: null,
    ...over,
  }) as unknown as JournalEntry;

describe("canonical result derivation", () => {
  it("classifies win, loss, breakeven and not-measurable", () => {
    expect(resultOf(120)).toBe("win");
    expect(resultOf(-40)).toBe("loss");
    expect(resultOf(0)).toBe("breakeven");
    expect(resultOf(null)).toBeNull();
    expect(resultOf(undefined)).toBeNull();
  });

  it("never substitutes zero for missing fees", () => {
    expect(feesOf({ commission: null, swap: null })).toBeNull();
    expect(feesOf({ commission: -3, swap: -1 })).toBe(-4);
  });

  it("derives gross from net plus fees", () => {
    const d = deriveTrade(base({ pnl: 100, commission: -5, swap: -2 }));
    expect(d.netPnl).toBe(100);
    expect(d.fees).toBe(-7);
    expect(d.grossPnl).toBe(93);
  });

  it("uses planned risk before execution levels", () => {
    const planned = deriveTrade(
      base({
        pnl: 200,
        entry_price: 100,
        stop_loss: 98,
        lot_size: 50,
        narrative: { x: { risk_amount: 100 } } as never,
      }),
    );
    expect(planned.riskBasis).toBe("planned");
    expect(planned.r).toBe(2);
  });

  it("falls back to entry/stop/size when no planned risk exists", () => {
    const d = deriveTrade(base({ pnl: -50, entry_price: 100, stop_loss: 99, lot_size: 50 }));
    expect(d.riskBasis).toBe("levels");
    expect(d.riskAmount).toBe(50);
    expect(d.r).toBe(-1);
  });

  it("reports R as not measurable without a risk basis", () => {
    const d = deriveTrade(base({ pnl: 100 }));
    expect(d.r).toBeNull();
    expect(d.rBasis).toBeNull();
  });

  it("recomputes R when a winner is edited into a loser", () => {
    const entry = base({ pnl: 200, entry_price: 100, stop_loss: 99, lot_size: 100, rr: 2 });
    const patch = derivedPatch(entry, { pnl: -100 });
    expect(patch.rr).toBe(-1);
    expect(deriveTrade({ ...entry, ...patch, pnl: -100 }).result).toBe("loss");
  });

  it("keeps a trader-corrected R untouched", () => {
    const entry = base({
      pnl: 200,
      entry_price: 100,
      stop_loss: 99,
      lot_size: 100,
      rr: 3.5,
      field_sources: { rr: "corrected" } as never,
    });
    expect(derivedPatch(entry, { pnl: -100 })).toEqual({});
    expect(deriveTrade(entry).r).toBe(3.5);
  });

  it("does not rewrite R when unrelated fields change", () => {
    const entry = base({ pnl: 200, entry_price: 100, stop_loss: 99, lot_size: 100, rr: 2 });
    expect(derivedPatch(entry, { setup: "breakout" } as never)).toEqual({});
  });
});
