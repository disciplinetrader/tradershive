import { describe, it, expect } from "vitest";
import { validateOrder } from "../model";

describe("THIVE-005: Trading Validation Extreme Cases", () => {
  it("should reject negative or zero lot size", () => {
    const result = validateOrder({
      symbol: "EURUSD",
      orderType: "market",
      drawingId: "test-drawing",
      entry: 1.1,
      stop: 1.05,
      target: 1.2,
      direction: "buy",
      size: -5,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("Lot size"))).toBe(true);
  });

  it("should reject zero risk (stop at entry)", () => {
    const result = validateOrder({
      symbol: "EURUSD",
      orderType: "market",
      drawingId: "test-drawing",
      entry: 1.1,
      stop: 1.1,
      target: 1.2,
      direction: "buy",
      size: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("Risk is zero"))).toBe(true);
  });

  it("should reject extreme take profit values that cause overflow or are infinite", () => {
    const result = validateOrder({
      symbol: "EURUSD",
      orderType: "market",
      drawingId: "test-drawing",
      entry: 1.1,
      stop: 1.05,
      target: Infinity,
      direction: "buy",
      size: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("reward value"))).toBe(true);
  });

  it("should reject stop loss in wrong direction", () => {
    const result = validateOrder({
      symbol: "EURUSD",
      orderType: "market",
      drawingId: "test-drawing",
      entry: 1.1,
      stop: 1.15, // sl above entry for buy
      target: 1.2,
      direction: "buy",
      size: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("stop loss must be below"))).toBe(true);
  });
});
