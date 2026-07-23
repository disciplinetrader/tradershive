/**
 * Vitest-compatible test cases for the SL/TP predicate. Run with:
 *   bunx vitest run src/lib/paper-trading/sl-tp.test.ts
 * (No test runner is currently wired into the project; the assertions are
 * also valid plain-JS and can be executed with `bun run` after inlining.)
 */
import { describe, it, expect } from "vitest";
import { evaluateSlTpOnTick, evaluateSlTpOnCandle } from "./sl-tp";

describe("evaluateSlTpOnTick — LONG", () => {
  it("fires SL when price crosses below stop", () => {
    expect(evaluateSlTpOnTick("long", 1.0490, 1.0500, 1.0600)).toEqual({ price: 1.0500, reason: "stop_loss" });
  });
  it("fires SL exactly at stop (inclusive)", () => {
    expect(evaluateSlTpOnTick("long", 1.0500, 1.0500, 1.0600)).toEqual({ price: 1.0500, reason: "stop_loss" });
  });
  it("fires TP when price crosses above target", () => {
    expect(evaluateSlTpOnTick("long", 1.0610, 1.0500, 1.0600)).toEqual({ price: 1.0600, reason: "take_profit" });
  });
  it("returns null while price is between SL and TP", () => {
    expect(evaluateSlTpOnTick("long", 1.0550, 1.0500, 1.0600)).toBeNull();
  });
  it("prefers SL over TP on a gap that crosses both", () => {
    // Should never happen mid-tick, but the predicate must be deterministic.
    expect(evaluateSlTpOnTick("long", 1.0400, 1.0500, 1.0600)).toEqual({ price: 1.0500, reason: "stop_loss" });
  });
});

describe("evaluateSlTpOnTick — SHORT", () => {
  it("fires SL when price crosses above stop", () => {
    expect(evaluateSlTpOnTick("short", 1.0610, 1.0600, 1.0500)).toEqual({ price: 1.0600, reason: "stop_loss" });
  });
  it("fires TP when price crosses below target", () => {
    expect(evaluateSlTpOnTick("short", 1.0490, 1.0600, 1.0500)).toEqual({ price: 1.0500, reason: "take_profit" });
  });
  it("returns null while price is between SL and TP", () => {
    expect(evaluateSlTpOnTick("short", 1.0550, 1.0600, 1.0500)).toBeNull();
  });
});

describe("evaluateSlTpOnTick — guards", () => {
  it("ignores non-positive price", () => {
    expect(evaluateSlTpOnTick("long", 0, 1.05, 1.06)).toBeNull();
  });
  it("ignores null SL/TP", () => {
    expect(evaluateSlTpOnTick("long", 1.0400, null, null)).toBeNull();
  });
});

describe("evaluateSlTpOnCandle", () => {
  it("LONG SL fires when candle.low <= SL", () => {
    expect(evaluateSlTpOnCandle("long", { high: 1.06, low: 1.049 }, 1.05, 1.07))
      .toEqual({ price: 1.05, reason: "stop_loss" });
  });
  it("LONG TP fires when candle.high >= TP", () => {
    expect(evaluateSlTpOnCandle("long", { high: 1.071, low: 1.06 }, 1.05, 1.07))
      .toEqual({ price: 1.07, reason: "take_profit" });
  });
  it("SHORT SL fires when candle.high >= SL", () => {
    expect(evaluateSlTpOnCandle("short", { high: 1.061, low: 1.05 }, 1.06, 1.04))
      .toEqual({ price: 1.06, reason: "stop_loss" });
  });
  it("SHORT TP fires when candle.low <= TP", () => {
    expect(evaluateSlTpOnCandle("short", { high: 1.05, low: 1.039 }, 1.06, 1.04))
      .toEqual({ price: 1.04, reason: "take_profit" });
  });
  it("SL wins over TP on a wide bar that spans both", () => {
    expect(evaluateSlTpOnCandle("long", { high: 1.08, low: 1.04 }, 1.05, 1.07))
      .toEqual({ price: 1.05, reason: "stop_loss" });
  });
});
