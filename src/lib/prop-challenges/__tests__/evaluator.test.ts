import { describe, it, expect } from "vitest";
import { evaluateChallenge, type PropChallengeRow, type PropChallengeDayRow } from "../evaluator";

/**
 * The canonical prop-firm rule evaluator.
 *
 * These assertions used to live in `trading-engine/scenarios-phase3.ts`, a
 * self-test harness that nothing called, checking a SECOND implementation of
 * the same rules (`trading-engine/prop-firm-rules.ts`). Both are gone: one
 * evaluator, and its coverage now runs on every commit instead of waiting for
 * someone to invoke a harness by hand.
 *
 * The numbers are carried over unchanged from those scenarios, so what the
 * dead implementation asserted is still asserted here.
 */

const DAY: PropChallengeDayRow = {
  day_date: "2026-07-01",
  start_equity: 100_000,
  end_equity: 100_000,
  high_equity: 100_000,
  low_equity: 100_000,
  realized_pnl: 0,
  trades_count: 0,
  breached: false,
  breach_code: null,
};

function challenge(over: Partial<PropChallengeRow> = {}): PropChallengeRow {
  return {
 user_id: 'u1',
    id: "c1",
    name: "Test",
    preset: "custom",
    paper_account_id: null,
    account_size: 100_000,
    currency: "USD",
    profit_target_pct: 8,
    max_daily_loss_pct: 5,
    max_total_drawdown_pct: 10,
    min_trading_days: 5,
    leverage: 100,
    duration_days: 30,
    status: "active",
    result: null,
    started_at: "2026-07-01T00:00:00.000Z",
    ends_at: null,
    completed_at: null,
    starting_equity: 100_000,
    current_equity: 100_000,
    peak_equity: 100_000,
    lowest_equity: 100_000,
    realized_pnl: 0,
    trading_days_used: 0,
    breach_reason: null,
    breach_at: null,
    ...over,
  };
}

function day(over: Partial<PropChallengeDayRow>): PropChallengeDayRow {
  return { ...DAY, ...over };
}

describe("evaluateChallenge — the passing evaluation", () => {
  // Carried from `scenarioPropFirmRules`: 100k account, 8% target, 5% daily,
  // 10% total, 5 minimum days, finishing at 108,200 over five traded days.
  const days = [
    day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 101_500, high_equity: 101_800, realized_pnl: 1_500, trades_count: 4 }),
    day({ day_date: "2026-07-02", start_equity: 101_500, end_equity: 100_700, high_equity: 101_600, realized_pnl: -800, trades_count: 3 }),
    day({ day_date: "2026-07-03", start_equity: 100_700, end_equity: 102_700, high_equity: 103_000, realized_pnl: 2_000, trades_count: 5 }),
    day({ day_date: "2026-07-06", start_equity: 102_700, end_equity: 104_000, high_equity: 104_400, realized_pnl: 1_300, trades_count: 2 }),
    day({ day_date: "2026-07-07", start_equity: 104_000, end_equity: 108_200, high_equity: 108_500, realized_pnl: 4_200, trades_count: 6 }),
  ];
  const result = evaluateChallenge(challenge({ peak_equity: 108_500 }), days, 108_200);

  it("passes with the target hit and the day count met", () => {
    expect(result.verdict).toBe("passed");
    expect(result.breach).toBeUndefined();
    expect(result.profit.hit).toBe(true);
    expect(result.tradingDays.met).toBe(true);
  });

  it("reports the profit exactly: 8,200 on 100,000 against an 8,000 target", () => {
    expect(result.profit.amount).toBe(8_200);
    expect(result.profit.targetAmount).toBe(8_000);
    expect(result.profit.pct).toBeCloseTo(8.2, 10);
  });

  it("counts only days that actually traded", () => {
    expect(result.tradingDays.used).toBe(5);
    expect(result.tradingDays.required).toBe(5);
  });
});

describe("evaluateChallenge — breaches", () => {
  it("fails on the daily loss limit", () => {
    // Carried from `scenarioPropFirmBreach`: one day, −6,000 on a 5% (5,000)
    // daily limit. The deleted implementation called this `daily_drawdown`;
    // the canonical name is `daily_loss`.
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 94_000, low_equity: 94_000, realized_pnl: -6_000, trades_count: 3 }),
    ];
    const result = evaluateChallenge(challenge({ peak_equity: 100_000 }), days, 94_000);

    expect(result.verdict).toBe("failed");
    expect(result.breach?.code).toBe("daily_loss");
    expect(result.dailyLoss.remainingAmount).toBe(0);
    expect(result.dailyLoss.safe).toBe(false);
  });

  it("fails on total drawdown when the daily limit is wide enough to allow it", () => {
    // A 12,000 fall from peak breaches the 10% (10,000) total limit. The daily
    // limit is set to 20% so the daily rule cannot fire first and mask it.
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 88_000, low_equity: 88_000, realized_pnl: -12_000, trades_count: 2 }),
    ];
    const result = evaluateChallenge(
      challenge({ peak_equity: 100_000, max_daily_loss_pct: 20 }),
      days,
      88_000,
    );

    expect(result.verdict).toBe("failed");
    expect(result.breach?.code).toBe("max_drawdown");
  });

  it("checks the daily limit before the total one, so a gap through both is a daily breach", () => {
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 85_000, low_equity: 85_000, realized_pnl: -15_000, trades_count: 1 }),
    ];
    const result = evaluateChallenge(challenge({ peak_equity: 100_000 }), days, 85_000);
    expect(result.breach?.code).toBe("daily_loss");
  });

  it("withholds a pass until the minimum trading days are served", () => {
    // Target cleared on day one. A prop firm does not pass that account.
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 110_000, high_equity: 110_000, realized_pnl: 10_000, trades_count: 3 }),
    ];
    const result = evaluateChallenge(challenge({ peak_equity: 110_000 }), days, 110_000);

    expect(result.profit.hit).toBe(true);
    expect(result.tradingDays.met).toBe(false);
    expect(result.verdict).toBe("in_progress");
  });
});

describe("evaluateChallenge — the semantics item 3 builds on", () => {
  /**
   * PF-1: max drawdown is measured from PEAK equity, not from the starting
   * balance — a trailing rule, not a static one. The deleted implementation
   * measured it from the start, and the two disagree exactly when an account
   * has been profitable, which is the case that matters.
   *
   * Pinned so the difference is a decision rather than a regression.
   */
  it("measures drawdown from the peak, not the starting balance", () => {
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 112_000, high_equity: 115_000, realized_pnl: 12_000, trades_count: 3 }),
    ];
    // Peaked at 115,000, now 104,000: 11,000 off the peak breaches the 10,000
    // limit, even though the account is still 4,000 ABOVE its starting balance.
    const result = evaluateChallenge(
      challenge({ peak_equity: 115_000, max_daily_loss_pct: 50 }),
      days,
      104_000,
    );

    // `usedPct` is clamped for the progress bar, so a breach reads as exactly
    // 100 rather than the true 110 — the verdict carries the overshoot.
    expect(result.drawdown.usedPct).toBe(100);
    expect(result.drawdown.remainingAmount).toBe(0);
    expect(result.verdict).toBe("failed");
    expect(result.breach?.code).toBe("max_drawdown");
    // Static drawdown would read this account as +4% and pass it.
    expect(result.profit.amount).toBe(4_000);
  });

  it("resets the daily reference each day rather than tracking from the start", () => {
    // Down 4,000 from a 108,000 day-open is inside a 5% (5,400) daily limit,
    // even though the account is 2,000 below where the challenge began.
    const days = [
      day({ day_date: "2026-07-01", start_equity: 100_000, end_equity: 108_000, high_equity: 108_000, realized_pnl: 8_000, trades_count: 3 }),
      day({ day_date: "2026-07-02", start_equity: 108_000, end_equity: 104_000, low_equity: 104_000, realized_pnl: -4_000, trades_count: 2 }),
    ];
    const result = evaluateChallenge(challenge({ peak_equity: 108_000 }), days, 104_000);

    expect(result.todayPnl).toBe(-4_000);
    expect(result.dailyLoss.remainingAmount).toBe(1_400);
    expect(result.breach).toBeUndefined();
  });

  it("honours a status already recorded on the row", () => {
    const passed = evaluateChallenge(challenge({ status: "passed" }), [DAY], 100_000);
    expect(passed.verdict).toBe("passed");

    const failed = evaluateChallenge(
      challenge({ status: "failed", breach_reason: "Daily loss limit of 5% exceeded" }),
      [DAY],
      100_000,
    );
    expect(failed.verdict).toBe("failed");
    expect(failed.breach?.message).toBe("Daily loss limit of 5% exceeded");
  });
});
