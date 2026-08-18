/**
 * Phase 2 · item 3 — prop-firm rules on a REPLAY session.
 *
 * Composition, not reimplementation. The rules themselves are not restated
 * here: this module folds a session's canonical `ClosedTrade` tape into the
 * day rows `evaluateChallenge` already consumes, and hands them to it. There
 * is exactly one prop-firm rule evaluator in the product and this is not it.
 *
 * What IS this module's job is the clock.
 *
 * A live paper challenge runs on wall-clock: today is today, and a day rolls
 * at midnight where the trader is. A replay does not. A July session opened in
 * August must measure its days against the bar under the cursor, or every
 * daily-loss reset lands on the wrong side of the data. That is the same bug
 * Phase 1 fixed in `chart/orders/service` — Studio omitted `now` at four
 * mutator call sites and stamped replayed trades with today, which silently
 * corrupted `averageHoldSeconds` for months. So market time is threaded
 * explicitly through every call here, and `Date.now()` appears nowhere.
 *
 * Market days are UTC, via the same `dayKey` the session summary's day strip
 * uses: which day the 2026-07-05 candle belongs to is a market fact, not a
 * viewer preference.
 */

import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import { dayKey } from "@/lib/analytics/periods";
import {
  evaluateChallenge,
  type ChallengeProgress,
  type PropChallengeDayRow,
  type PropChallengeRow,
} from "@/lib/prop-challenges/evaluator";
import { PROP_PRESETS, type PropPresetId } from "@/lib/prop-challenges/presets";

/** Key under `replay_sessions.settings` holding the ruleset. */
export const REPLAY_CHALLENGE_SETTINGS_KEY = "prop_challenge_v1";

/**
 * The ruleset a session was created under.
 *
 * Snapshotted onto the session, never read from a live setting — the same
 * decision `spread` and `slippage` got in Phase 0. A replay is reproducible by
 * construction, and a rule read at tick time would mean two traders on one
 * session fail at different points.
 */
/**
 * A type alias rather than an interface, deliberately: this shape is written
 * straight into a JSONB column, and Supabase's generated `Json` type is
 * satisfied by aliases but not by interfaces — an interface stays open to
 * declaration merging, so TypeScript cannot prove it has no non-JSON members.
 */
export type ReplayPropRules = {
  /** Provenance — which preset these numbers came from. */
  presetId: PropPresetId;
  accountSize: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxTotalDrawdownPct: number;
  minTradingDays: number;
};

export function rulesFromPreset(id: PropPresetId): ReplayPropRules {
  const p = PROP_PRESETS[id] ?? PROP_PRESETS.custom;
  return {
    presetId: p.id,
    accountSize: p.account_size,
    profitTargetPct: p.profit_target_pct,
    maxDailyLossPct: p.max_daily_loss_pct,
    maxTotalDrawdownPct: p.max_total_drawdown_pct,
    minTradingDays: p.min_trading_days,
  };
}

/** Narrow an unknown settings blob back to a ruleset, or null. */
export function readRules(settings: unknown): ReplayPropRules | null {
  const blob = (settings as Record<string, unknown> | null)?.[REPLAY_CHALLENGE_SETTINGS_KEY];
  if (!blob || typeof blob !== "object") return null;
  const r = blob as Partial<ReplayPropRules>;
  const nums = [r.accountSize, r.profitTargetPct, r.maxDailyLossPct, r.maxTotalDrawdownPct, r.minTradingDays];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return {
    presetId: (r.presetId ?? "custom") as PropPresetId,
    accountSize: r.accountSize as number,
    profitTargetPct: r.profitTargetPct as number,
    maxDailyLossPct: r.maxDailyLossPct as number,
    maxTotalDrawdownPct: r.maxTotalDrawdownPct as number,
    minTradingDays: r.minTradingDays as number,
  };
}

export interface ReplayChallengeInput {
  rules: ReplayPropRules;
  startingBalance: number;
  /** The session's closed trades. Order is irrelevant — they are grouped. */
  trades: readonly ClosedTrade[];
  /** Unrealised P/L on open positions at the cursor. */
  openPnl: number;
  /** MARKET time under the cursor. Never `Date.now()`. */
  marketTime: number;
  /**
   * Highest equity seen so far INCLUDING open P/L, carried by the caller
   * across ticks. Omit and the peak is seeded from the realised curve.
   *
   * Why the caller carries it: floating equity is not in the trade tape, so a
   * peak reached while a position was open and then given back cannot be
   * recovered after the fact. A resumed session therefore restarts from its
   * realised peak, which is the highest value that IS reconstructible. Stated
   * rather than hidden — it makes a resumed trailing drawdown slightly
   * forgiving, never stricter.
   */
  peakEquity?: number | null;
}

export interface ReplayChallengeEvaluation {
  progress: ChallengeProgress;
  /** One row per MARKET day, oldest first, including today's open row. */
  days: PropChallengeDayRow[];
  equity: number;
  peakEquity: number;
  /** Convenience mirror of `progress.verdict === "failed"`. */
  breached: boolean;
}

/**
 * Fold closed trades into per-market-day equity rows.
 *
 * `high_equity` / `low_equity` are per-trade granularity: the equity curve is
 * only observable where it is recorded, and it is recorded at closes. They are
 * not used by the daily-loss rule — which compares the day's opening equity to
 * live equity — so this cannot make a breach fire early or late.
 */
export function buildChallengeDays(
  trades: readonly ClosedTrade[],
  startingBalance: number,
): PropChallengeDayRow[] {
  const byDay = new Map<string, ClosedTrade[]>();
  for (const t of trades) {
    if (!Number.isFinite(t.exitTime)) continue;
    const key = dayKey(t.exitTime, "UTC");
    const list = byDay.get(key);
    if (list) list.push(t);
    else byDay.set(key, [t]);
  }

  const rows: PropChallengeDayRow[] = [];
  let running = startingBalance;
  for (const key of [...byDay.keys()].sort()) {
    const dayTrades = byDay.get(key)!.sort((a, b) => a.exitTime - b.exitTime);
    const start = running;
    let high = start;
    let low = start;
    let realized = 0;
    for (const t of dayTrades) {
      const pnl = Number.isFinite(t.netPnl) ? t.netPnl : 0;
      realized += pnl;
      running += pnl;
      if (running > high) high = running;
      if (running < low) low = running;
    }
    rows.push({
      day_date: key,
      start_equity: start,
      end_equity: running,
      high_equity: high,
      low_equity: low,
      realized_pnl: realized,
      trades_count: dayTrades.length,
      breached: false,
      breach_code: null,
    });
  }
  return rows;
}

/**
 * Evaluate the session against its ruleset at the cursor's market time.
 *
 * The current market day always gets a row, even before it has a closed trade:
 * `evaluateChallenge` measures the daily loss against the LAST row's opening
 * equity, so without it a fresh day would be judged against yesterday's open
 * and a trader could lose the daily allowance twice over without breaching.
 */
export function evaluateReplayChallenge(input: ReplayChallengeInput): ReplayChallengeEvaluation {
  const { rules, startingBalance, trades, openPnl, marketTime } = input;

  const days = buildChallengeDays(trades, startingBalance);
  const realizedEquity = days.length ? days[days.length - 1].end_equity : startingBalance;
  const equity = realizedEquity + openPnl;

  const today = dayKey(marketTime, "UTC");
  if (!days.length || days[days.length - 1].day_date !== today) {
    days.push({
      day_date: today,
      start_equity: realizedEquity,
      end_equity: realizedEquity,
      high_equity: realizedEquity,
      low_equity: realizedEquity,
      realized_pnl: 0,
      trades_count: 0,
      breached: false,
      breach_code: null,
    });
  }

  // Peak includes floating equity, so it can only be carried forward, never
  // recomputed from the tape alone. Seed from the realised curve.
  const realizedPeak = days.reduce((m, d) => Math.max(m, d.high_equity), startingBalance);
  const peakEquity = Math.max(
    input.peakEquity ?? Number.NEGATIVE_INFINITY,
    realizedPeak,
    equity,
  );

  const startedAt = days.length ? `${days[0].day_date}T00:00:00.000Z` : new Date(marketTime).toISOString();

  const row: PropChallengeRow = {
    id: "replay",
    name: "Replay challenge",
    preset: rules.presetId,
    paper_account_id: null,
    account_size: rules.accountSize,
    currency: "USD",
    profit_target_pct: rules.profitTargetPct,
    max_daily_loss_pct: rules.maxDailyLossPct,
    max_total_drawdown_pct: rules.maxTotalDrawdownPct,
    min_trading_days: rules.minTradingDays,
    leverage: 0,
    // Duration is not a replay concept: the tape's length decides how long the
    // session is, not a calendar. Zero so `daysRemaining` cannot imply one.
    duration_days: 0,
    status: "active",
    result: null,
    started_at: startedAt,
    ends_at: null,
    completed_at: null,
    starting_equity: startingBalance,
    current_equity: equity,
    peak_equity: peakEquity,
    lowest_equity: days.reduce((m, d) => Math.min(m, d.low_equity), startingBalance),
    realized_pnl: realizedEquity - startingBalance,
    trading_days_used: days.filter((d) => d.trades_count > 0).length,
    breach_reason: null,
    breach_at: null,
  };

  // Market time, not wall clock — the whole point of this module.
  const progress = evaluateChallenge(row, days, equity, marketTime);

  return { progress, days, equity, peakEquity, breached: progress.verdict === "failed" };
}

/** Plain-language breach line: which field went, and by how much. */
export function describeBreach(progress: ChallengeProgress): {
  field: string;
  detail: string;
  observed: number;
  limit: number;
} | null {
  const b = progress.breach;
  if (!b) return null;
  if (b.code === "daily_loss") {
    return {
      field: "Daily loss limit",
      detail: b.message,
      observed: progress.dailyLoss.usedAmount,
      limit: progress.dailyLoss.limitAmount,
    };
  }
  if (b.code === "max_drawdown") {
    return {
      field: "Maximum drawdown",
      detail: b.message,
      observed: progress.drawdown.usedAmount,
      limit: progress.drawdown.limitAmount,
    };
  }
  return { field: "Challenge rule", detail: b.message, observed: 0, limit: 0 };
}
