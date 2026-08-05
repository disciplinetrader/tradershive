import { describe, it, expect } from "vitest";
import { validateOrder } from "../model";

describe("THIVE-005: Comprehensive Trading Validation", () => {
  const baseDraft = {
    symbol: "EURUSD",
    orderType: "market",
    drawingId: "test",
    entry: 1.1,
    stop: 1.05,
    target: 1.2,
    direction: "buy",
    size: 1,
  };

  it("should reject Infinity and NaN", () => {
    const res = validateOrder({ ...baseDraft, entry: Infinity } as any);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("finite numbers");
  });

  it("should reject negative lot size", () => {
    const res = validateOrder({ ...baseDraft, size: -5 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("Lot size"))).toBe(true);
  });

  it("should reject zero lot size", () => {
    const res = validateOrder({ ...baseDraft, size: 0 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("Lot size"))).toBe(true);
  });

  it("should reject numeric overflow (> 1T)", () => {
    const res = validateOrder({ ...baseDraft, target: 2_000_000_000_000 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("overflow"))).toBe(true);
  });

  it("should reject buy stop loss above entry", () => {
    const res = validateOrder({ ...baseDraft, stop: 1.15 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("stop loss must be below"))).toBe(true);
  });

  it("should reject buy target below entry", () => {
    const res = validateOrder({ ...baseDraft, target: 1.05 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("take profit must be above"))).toBe(true);
  });

  it("should reject zero risk", () => {
    const res = validateOrder({ ...baseDraft, stop: 1.1 } as any);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes("Risk is zero"))).toBe(true);
  });
});
