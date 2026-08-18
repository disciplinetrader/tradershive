import { describe, it, expect } from "vitest";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import {
  buildChallengeDays,
  describeBreach,
  evaluateReplayChallenge,
  readRules,
  rulesFromPreset,
  REPLAY_CHALLENGE_SETTINGS_KEY,
  type ReplayPropRules,
} from "../prop-challenge";

/**
 * Prop-firm rules on a replay session.
 *
 * The rules themselves are covered in `prop-challenges/__tests__/evaluator`.
 * What is covered HERE is the part that is replay-specific and the part that
 * has bitten this codebase before: the clock. Every assertion below uses July
 * 2026 market timestamps while the suite runs in August, so anything that
 * silently reaches for `Date.now()` fails rather than merely looking odd.
 */

const START = 100_000;
const D = (day: number, hour = 12) => Date.UTC(2026, 6, day, hour, 0, 0);

const RULES: ReplayPropRules = {
  presetId: "custom",
  accountSize: START,
  profitTargetPct: 8,
  maxDailyLossPct: 5,
  maxTotalDrawdownPct: 10,
  minTradingDays: 3,
};

let seq = 0;
function trade(exitTime: number, netPnl: number): ClosedTrade {
  seq += 1;
  return { id: `t${seq}`, exitTime, netPnl } as unknown as ClosedTrade;
}

function evaluate(over: {
  trades?: ClosedTrade[];
  openPnl?: number;
  marketTime: number;
  rules?: Partial<ReplayPropRules>;
  peakEquity?: number | null;
}) {
  return evaluateReplayChallenge({
    rules: { ...RULES, ...over.rules },
    startingBalance: START,
    trades: over.trades ?? [],
    openPnl: over.openPnl ?? 0,
    marketTime: over.marketTime,
    peakEquity: over.peakEquity,
  });
}

describe("buildChallengeDays — one row per market day", () => {
  it("groups by UTC market day and runs the equity curve through them", () => {
    const days = buildChallengeDays(
      [trade(D(5, 9), 2_000), trade(D(5, 15), -500), trade(D(6, 10), -1_000)],
      START,
    );

    expect(days.map((d) => d.day_date)).toEqual(["2026-07-05", "2026-07-06"]);
    expect(days[0]).toMatchObject({
      start_equity: 100_000, end_equity: 101_500, high_equity: 102_000, realized_pnl: 1_500, trades_count: 2,
    });
    expect(days[1]).toMatchObject({
      start_equity: 101_500, end_equity: 100_500, low_equity: 100_500, realized_pnl: -1_000, trades_count: 1,
    });
  });

  it("orders days chronologically regardless of the tape's order", () => {
    const days = buildChallengeDays([trade(D(9), 100), trade(D(5), 200), trade(D(7), 300)], START);
    expect(days.map((d) => d.day_date)).toEqual(["2026-07-05", "2026-07-07", "2026-07-09"]);
    expect(days[2].end_equity).toBe(100_600);
  });

  it("ignores trades with no usable exit time", () => {
    const days = buildChallengeDays([trade(NaN, 500), trade(D(5), 100)], START);
    expect(days).toHaveLength(1);
    expect(days[0].realized_pnl).toBe(100);
  });
});

describe("evaluateReplayChallenge — the clock is market time", () => {
  it("measures elapsed days from the first market day to the cursor, not to today", () => {
    // First trade 2026-07-05, cursor 2026-07-07 10:00 UTC → 2 days elapsed.
    // Wall-clock would read ~44 days, because the suite runs in August 2026.
    // That is the Phase 1 bug class: a replayed July session dated to today.
    const result = evaluate({ trades: [trade(D(5), 2_000)], marketTime: D(7, 10) });
    expect(result.progress.duration.daysElapsed).toBe(2);
  });

  it("opens a row for the current market day even before it has a trade", () => {
    // Without it the daily loss would be judged against yesterday's opening
    // equity, and a trader could spend the daily allowance twice over.
    const result = evaluate({
      trades: [trade(D(5), 2_000), trade(D(6), -1_000)],
      marketTime: D(7, 10),
    });

    expect(result.days.map((d) => d.day_date)).toEqual(["2026-07-05", "2026-07-06", "2026-07-07"]);
    const today = result.days[2];
    expect(today.trades_count).toBe(0);
    expect(today.start_equity).toBe(101_000);
    expect(result.equity).toBe(101_000);
    expect(result.progress.tradingDays.used).toBe(2);
  });

  it("does not duplicate the day when the cursor sits on a day that traded", () => {
    const result = evaluate({ trades: [trade(D(5), 2_000)], marketTime: D(5, 20) });
    expect(result.days).toHaveLength(1);
    expect(result.days[0].day_date).toBe("2026-07-05");
  });
});

describe("evaluateReplayChallenge — the daily rule resets on the market day", () => {
  const priorDays = [trade(D(5), 2_000), trade(D(6), -1_000)]; // equity 101,000

  it("allows a loss inside today's envelope even when the session is down overall", () => {
    // Day opens at 101,000 → 5% limit is 5,050. Down 4,900 on the day is
    // inside it, though the account is 3,900 below where the session started.
    const result = evaluate({ trades: priorDays, openPnl: -4_900, marketTime: D(7, 10) });

    expect(result.equity).toBe(96_100);
    expect(result.breached).toBe(false);
    expect(result.progress.dailyLoss.limitAmount).toBe(5_050);
    expect(result.progress.dailyLoss.usedAmount).toBe(4_900);
    expect(result.progress.dailyLoss.remainingAmount).toBe(150);
  });

  it("breaches one tick past the envelope, and can say by how much", () => {
    const result = evaluate({ trades: priorDays, openPnl: -5_100, marketTime: D(7, 10) });

    expect(result.breached).toBe(true);
    expect(result.progress.breach?.code).toBe("daily_loss");

    const described = describeBreach(result.progress)!;
    expect(described.field).toBe("Daily loss limit");
    expect(described.observed).toBe(5_100);
    expect(described.limit).toBe(5_050);
    // The unclamped figures are what make "by how much" statable at all.
    expect(described.observed - described.limit).toBe(50);
  });

  it("counts open P/L, so a breach does not wait for the position to close", () => {
    const open = evaluate({ trades: priorDays, openPnl: -6_000, marketTime: D(7, 10) });
    expect(open.breached).toBe(true);
    const flat = evaluate({ trades: priorDays, openPnl: 0, marketTime: D(7, 10) });
    expect(flat.breached).toBe(false);
  });
});

describe("evaluateReplayChallenge — drawdown trails the peak", () => {
  it("fails an account that is still above its starting balance", () => {
    // Peaked at 115,000, now 104,000: 11,000 off the peak breaches the 10,000
    // limit while the account is 4,000 UP on the session. Daily limit widened
    // to 20% so the daily rule cannot fire first and mask it.
    const result = evaluate({
      trades: [trade(D(5), 15_000), trade(D(6), -11_000)],
      marketTime: D(6, 20),
      rules: { maxDailyLossPct: 20 },
    });

    expect(result.equity).toBe(104_000);
    expect(result.peakEquity).toBe(115_000);
    expect(result.breached).toBe(true);
    expect(result.progress.breach?.code).toBe("max_drawdown");

    const described = describeBreach(result.progress)!;
    expect(described.field).toBe("Maximum drawdown");
    expect(described.observed).toBe(11_000);
    expect(described.limit).toBe(10_000);
    expect(result.progress.profit.amount).toBe(4_000);
  });

  it("honours a peak the caller carried across ticks", () => {
    // 120,000 was touched on floating equity, so it is not in the tape. The
    // caller carries it; the drawdown must be measured from it.
    const carried = evaluate({
      trades: [trade(D(5), 15_000), trade(D(6), -11_000)],
      marketTime: D(6, 20),
      rules: { maxDailyLossPct: 20 },
      peakEquity: 120_000,
    });
    expect(carried.peakEquity).toBe(120_000);
    expect(carried.progress.drawdown.usedAmount).toBe(16_000);
  });

  it("never lets a carried peak fall below what the tape already proves", () => {
    const result = evaluate({
      trades: [trade(D(5), 15_000)],
      marketTime: D(5, 20),
      peakEquity: 100, // nonsense, and must not lower the peak
    });
    expect(result.peakEquity).toBe(115_000);
  });
});

describe("evaluateReplayChallenge — passing", () => {
  it("passes once the target is cleared on enough trading days", () => {
    const result = evaluate({
      trades: [trade(D(5), 4_000), trade(D(6), 3_000), trade(D(7), 2_000)],
      marketTime: D(7, 20),
    });

    expect(result.equity).toBe(109_000);
    expect(result.progress.profit.amount).toBe(9_000);
    expect(result.progress.profit.targetAmount).toBe(8_000);
    expect(result.progress.tradingDays.used).toBe(3);
    expect(result.progress.verdict).toBe("passed");
  });

  it("withholds the pass while a day is still missing", () => {
    const result = evaluate({
      trades: [trade(D(5), 4_000), trade(D(6), 5_000)],
      marketTime: D(6, 20),
    });
    expect(result.progress.profit.hit).toBe(true);
    expect(result.progress.tradingDays.met).toBe(false);
    expect(result.progress.verdict).toBe("in_progress");
  });

  it("reports no duration pressure — a replay is bounded by its tape, not a calendar", () => {
    const result = evaluate({ trades: [trade(D(5), 100)], marketTime: D(7) });
    expect(result.progress.duration.totalDays).toBe(0);
    expect(result.progress.duration.daysRemaining).toBe(0);
  });
});

describe("rules serialisation", () => {
  it("builds a ruleset from a preset", () => {
    const ftmo = rulesFromPreset("ftmo");
    expect(ftmo).toEqual({
      presetId: "ftmo", accountSize: 100_000, profitTargetPct: 10,
      maxDailyLossPct: 5, maxTotalDrawdownPct: 10, minTradingDays: 4,
    });
  });

  it("round-trips through the settings blob", () => {
    const rules = rulesFromPreset("topstep");
    expect(readRules({ [REPLAY_CHALLENGE_SETTINGS_KEY]: rules })).toEqual(rules);
  });

  it("refuses a blob that is missing or malformed rather than inventing limits", () => {
    expect(readRules(null)).toBeNull();
    expect(readRules({})).toBeNull();
    expect(readRules({ [REPLAY_CHALLENGE_SETTINGS_KEY]: { presetId: "ftmo" } })).toBeNull();
    expect(
      readRules({ [REPLAY_CHALLENGE_SETTINGS_KEY]: { ...rulesFromPreset("ftmo"), maxDailyLossPct: "5" } }),
    ).toBeNull();
  });
});
