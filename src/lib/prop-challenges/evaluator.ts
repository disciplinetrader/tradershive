/**
 * Prop Challenge evaluator — pure functions used both server- and
 * client-side to compute progress bars, remaining risk envelopes and
 * pass/fail verdicts.
 */

export type PropChallengeRow = {
  id: string;
  name: string;
  preset: string;
  account_size: number;
  currency: string;
  profit_target_pct: number;
  max_daily_loss_pct: number;
  max_total_drawdown_pct: number;
  min_trading_days: number;
  leverage: number;
  duration_days: number;
  status: "active" | "passed" | "failed" | "abandoned";
  result: string | null;
  started_at: string;
  ends_at: string | null;
  completed_at: string | null;
  starting_equity: number;
  current_equity: number;
  peak_equity: number;
  lowest_equity: number;
  realized_pnl: number;
  trading_days_used: number;
  breach_reason: string | null;
  breach_at: string | null;
};

export type PropChallengeDayRow = {
  day_date: string;
  start_equity: number;
  end_equity: number;
  high_equity: number;
  low_equity: number;
  realized_pnl: number;
  trades_count: number;
  breached: boolean;
  breach_code: string | null;
};

export type ChallengeProgress = {
  profit: { pct: number; hit: boolean; targetPct: number; amount: number; targetAmount: number };
  dailyLoss: { usedPct: number; remainingPct: number; remainingAmount: number; safe: boolean };
  drawdown: { usedPct: number; remainingPct: number; remainingAmount: number; safe: boolean };
  tradingDays: { used: number; required: number; met: boolean };
  duration: { daysElapsed: number; daysRemaining: number; totalDays: number };
  todayPnl: number;
  verdict: "in_progress" | "passed" | "failed";
  breach?: { code: string; message: string };
};

/**
 * Evaluate a challenge against its latest daily snapshots. `todayEquity`
 * comes from the live paper account equity so the HUD reacts in real time.
 */
export function evaluateChallenge(
  c: PropChallengeRow,
  days: PropChallengeDayRow[],
  todayEquity: number = c.current_equity,
): ChallengeProgress {
  const start = c.starting_equity;
  const profitAmt = todayEquity - start;
  const targetAmount = start * (c.profit_target_pct / 100);
  const profitPct = (profitAmt / start) * 100;

  // Today's realized P/L — derived from the current day's row if present,
  // otherwise from equity vs previous day's close.
  const today = days[days.length - 1];
  const prevClose = days.length >= 2 ? days[days.length - 2].end_equity : start;
  const dailyRef = today?.start_equity ?? prevClose;
  const todayPnl = todayEquity - dailyRef;

  const dailyLossLimit = dailyRef * (c.max_daily_loss_pct / 100);
  const dailyLossUsed = Math.max(0, -todayPnl);
  const dailyRemaining = Math.max(0, dailyLossLimit - dailyLossUsed);
  const dailyUsedPct = dailyLossLimit > 0 ? (dailyLossUsed / dailyLossLimit) * 100 : 0;

  const ddLimit = start * (c.max_total_drawdown_pct / 100);
  const ddUsed = Math.max(0, c.peak_equity - todayEquity);
  const ddRemaining = Math.max(0, ddLimit - ddUsed);
  const ddUsedPct = ddLimit > 0 ? (ddUsed / ddLimit) * 100 : 0;

  const tradingDaysUsed = Math.max(c.trading_days_used, days.filter((d) => d.trades_count > 0).length);
  const startedAt = new Date(c.started_at).getTime();
  const now = Date.now();
  const daysElapsed = Math.max(0, Math.floor((now - startedAt) / 86_400_000));
  const daysRemaining = Math.max(0, c.duration_days - daysElapsed);

  let verdict: ChallengeProgress["verdict"] = "in_progress";
  let breach: ChallengeProgress["breach"];

  if (c.status === "passed") verdict = "passed";
  else if (c.status === "failed") {
    verdict = "failed";
    breach = { code: c.breach_reason ?? "failed", message: c.breach_reason ?? "Challenge failed" };
  } else if (dailyLossUsed > dailyLossLimit && dailyLossLimit > 0) {
    verdict = "failed";
    breach = { code: "daily_loss", message: `Daily loss limit of ${c.max_daily_loss_pct}% exceeded` };
  } else if (ddUsed > ddLimit && ddLimit > 0) {
    verdict = "failed";
    breach = { code: "max_drawdown", message: `Overall drawdown of ${c.max_total_drawdown_pct}% exceeded` };
  } else if (profitAmt >= targetAmount && tradingDaysUsed >= c.min_trading_days) {
    verdict = "passed";
  }

  return {
    profit: {
      pct: profitPct, hit: profitAmt >= targetAmount,
      targetPct: c.profit_target_pct, amount: profitAmt, targetAmount,
    },
    dailyLoss: {
      usedPct: Math.min(100, dailyUsedPct), remainingPct: Math.max(0, 100 - dailyUsedPct),
      remainingAmount: dailyRemaining, safe: dailyUsedPct < 60,
    },
    drawdown: {
      usedPct: Math.min(100, ddUsedPct), remainingPct: Math.max(0, 100 - ddUsedPct),
      remainingAmount: ddRemaining, safe: ddUsedPct < 60,
    },
    tradingDays: { used: tradingDaysUsed, required: c.min_trading_days, met: tradingDaysUsed >= c.min_trading_days },
    duration: { daysElapsed, daysRemaining, totalDays: c.duration_days },
    todayPnl,
    verdict,
    breach,
  };
}

export function formatCurrency(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}
