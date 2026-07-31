import { describe, expect, it } from "vitest";
import { makeDrawing } from "../store";
import { positionMetrics, tickFromFormatter } from "../position";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

const long = makeDrawing("long_position", [
  { time: T0, price: 1960 },
  { time: T0 + 30 * MIN, price: 1990 },
  { time: T0 + 30 * MIN, price: 1948 },
]);

describe("position metrics", () => {
  it("derives risk, reward, R:R, ticks and percentages from stored prices", () => {
    const m = positionMetrics(long, { tick: 0.01 })!;
    expect(m.risk).toBeCloseTo(12, 10);
    expect(m.reward).toBeCloseTo(30, 10);
    expect(m.rr).toBeCloseTo(2.5, 10);
    expect(m.riskTicks).toBe(1200);
    expect(m.rewardTicks).toBe(3000);
    expect(m.riskPct).toBeCloseTo((12 / 1960) * 100, 8);
    expect(m.size).toBeNull();
  });

  it("sizes off a risk budget when one is supplied", () => {
    const m = positionMetrics(long, { tick: 0.01, riskBudget: 120 })!;
    expect(m.size).toBeCloseTo(10, 10);
  });

  it("reads tick size from the chart's own price formatter", () => {
    expect(tickFromFormatter((p) => p.toFixed(2))).toBe(0.01);
    expect(tickFromFormatter((p) => p.toFixed(5))).toBe(0.00001);
    expect(tickFromFormatter((p) => p.toFixed(0))).toBe(1);
  });
});
