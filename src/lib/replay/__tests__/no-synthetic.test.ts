import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProvider, getSyntheticProvider, syntheticReplayEnabled } from "../market-data";
import { deserializeGaps, hasProvenance, serializeGaps } from "../provenance";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("production replay never writes synthetic", () => {
  it("Surprise Session does not hardcode a synthetic provider", () => {
    const src = read("lib/replay-studio.functions.ts");
    expect(src).not.toMatch(/provider:\s*"synthetic"/);
    expect(src).toMatch(/pickSurpriseSession/);
  });

  it("Practice attempts do not hardcode a synthetic provider", () => {
    const src = read("lib/journal/replay-attempts.ts");
    expect(src).not.toMatch(/provider:\s*"synthetic"/);
    expect(src).toMatch(/provider:\s*"historical"/);
  });

  it("Replay Settings no longer claims synthetic is active", () => {
    const src = read("routes/_authenticated/replay.settings.tsx");
    expect(src).not.toMatch(/Active provider:\s*<\/span>\s*synthetic/);
    expect(src).toMatch(/stored historical market data/);
  });
});

describe("synthetic provider gating", () => {
  it("is disabled by default", () => {
    expect(syntheticReplayEnabled()).toBe(false);
  });

  it("cannot be resolved by id in production", () => {
    expect(getProvider("synthetic")).toBeUndefined();
  });

  it("throws when requested explicitly while disabled", () => {
    expect(() => getSyntheticProvider()).toThrow(/disabled/i);
  });
});

describe("paper trading chart uses the market data engine", () => {
  const src = read("components/paper-trading/ChartArea.tsx");

  it("does not import or define a local candle generator", () => {
    expect(src).not.toMatch(/useSyntheticCandles/);
    expect(src).not.toMatch(/mulberry32|Math\.random/);
  });

  it("loads candles through the engine hook", () => {
    expect(src).toMatch(/useCandles/);
    expect(src).toMatch(/@\/lib\/market-data\/hooks/);
  });

  it("uses the canonical symbol mapping shared with quotes and watchlist", () => {
    expect(src).toMatch(/engineSymbol/);
  });

  it("shows an explicit unavailable state", () => {
    expect(src).toMatch(/Chart data unavailable/);
  });
});

describe("provenance serialization", () => {
  it("round-trips known gaps", () => {
    const gaps = [{ from: 1000, to: 2000, missing: 3 }];
    expect(deserializeGaps(serializeGaps(gaps))).toEqual(gaps);
  });

  it("treats legacy sessions as provenance-less", () => {
    expect(hasProvenance(null)).toBe(false);
    expect(
      hasProvenance({ source_provider: null, provenance_recorded_at: null } as never),
    ).toBe(false);
  });
});
