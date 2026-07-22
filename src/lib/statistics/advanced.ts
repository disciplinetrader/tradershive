/**
 * Phase 7 — Advanced Analytics calculations.
 *
 * Additive layer on top of `calculations.ts`. Consumes the existing
 * `AnalyticsTrade` shape (fed by the Trading Engine + Journal + Replay via
 * `getAnalyticsDataset`) — no new server round-trips.
 *
 * All functions are pure and memoization-friendly.
 */
import type { AnalyticsTrade } from "./types";
import { closedOnly, computeKpis, computeEquityCurve, groupByDay, groupByMonth } from "./calculations";

/* -------------------------------------------------------------------------- */
/*  Executive-summary metrics                                                 */
/* -------------------------------------------------------------------------- */

export interface ExecutiveMetrics {
  currentEquity: number;
  startingBalance: number;
  netProfit: number;
  accountGrowthPct: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgRR: number;
  avgMonthlyReturnPct: number;
  currentDrawdown: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  recoveryFactor: number;
  payoffRatio: number;
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  bestMonth: { month: string; pnl: number } | null;
  worstMonth: { month: string; pnl: number } | null;
}

export function computeExecutiveMetrics(
  trades: AnalyticsTrade[],
  startingBalance: number,
): ExecutiveMetrics {
  const k = computeKpis(trades);
  const currentEquity = startingBalance + k.netProfit;
  const growth = startingBalance > 0 ? (k.netProfit / startingBalance) * 100 : 0;

  const days = groupByDay(trades);
  const months = groupByMonth(trades);
  const bestDay = days.reduce<{ date: string; pnl: number } | null>((best, d) => (best == null || d.pnl > best.pnl ? { date: d.date, pnl: d.pnl } : best), null);
  const worstDay = days.reduce<{ date: string; pnl: number } | null>((worst, d) => (worst == null || d.pnl < worst.pnl ? { date: d.date, pnl: d.pnl } : worst), null);
  const bestMonth = months.reduce<{ month: string; pnl: number } | null>((best, m) => (best == null || m.pnl > best.pnl ? { month: m.month, pnl: m.pnl } : best), null);
  const worstMonth = months.reduce<{ month: string; pnl: number } | null>((worst, m) => (worst == null || m.pnl < worst.pnl ? { month: m.month, pnl: m.pnl } : worst), null);

  const monthCount = months.length;
  const avgMonthlyReturnPct = monthCount && startingBalance > 0
    ? (months.reduce((sum, m) => sum + m.pnl, 0) / monthCount / startingBalance) * 100
    : 0;

  const recoveryFactor = k.maxDrawdown > 0 ? k.netProfit / k.maxDrawdown : k.netProfit > 0 ? 999 : 0;
  const payoffRatio = k.avgLoser < 0 ? k.avgWinner / Math.abs(k.avgLoser) : k.avgWinner > 0 ? 999 : 0;

  return {
    currentEquity,
    startingBalance,
    netProfit: k.netProfit,
    accountGrowthPct: growth,
    totalTrades: k.totalTrades,
    winRate: k.winRate,
    profitFactor: k.profitFactor,
    expectancy: k.expectancy,
    avgRR: k.avgRR,
    avgMonthlyReturnPct,
    currentDrawdown: k.currentDrawdown,
    maxDrawdown: k.maxDrawdown,
    maxDrawdownPct: k.maxDrawdownPct,
    recoveryFactor,
    payoffRatio,
    bestDay,
    worstDay,
    bestMonth,
    worstMonth,
  };
}

/* -------------------------------------------------------------------------- */
/*  Weekly aggregation (missing from calculations.ts)                         */
/* -------------------------------------------------------------------------- */

function isoWeekKey(d: Date): string {
  // ISO-8601 week: Thursday of current week decides the year.
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function groupByWeek(trades: AnalyticsTrade[]) {
  const map = new Map<string, { week: string; pnl: number; trades: number; wins: number; losses: number }>();
  for (const t of closedOnly(trades)) {
    const key = isoWeekKey(new Date(t.closed_at!));
    const cur = map.get(key) ?? { week: key, pnl: 0, trades: 0, wins: 0, losses: 0 };
    cur.pnl += t.pnl;
    cur.trades++;
    if (t.pnl > 0) cur.wins++;
    else if (t.pnl < 0) cur.losses++;
    map.set(key, cur);
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/* -------------------------------------------------------------------------- */
/*  Risk consistency                                                          */
/* -------------------------------------------------------------------------- */

export interface RiskConsistency {
  sample: number;
  avgRiskPct: number;
  medianRiskPct: number;
  largestRiskPct: number;
  smallestRiskPct: number;
  stdDevRiskPct: number;
  coefficientOfVariation: number;
  riskConsistencyScore: number; // 0..100
  breaches: number;
  breachRate: number;
  avgLotSize: number;
  stdDevLotSize: number;
  positionSizeConsistencyScore: number; // 0..100
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeRiskConsistency(
  trades: AnalyticsTrade[],
  configuredRiskCapPct = 2,
): RiskConsistency {
  const list = closedOnly(trades);
  const risks = list.map((t) => t.risk_pct).filter((r): r is number => r != null && !Number.isNaN(r));
  const lots = list.map((t) => t.lot_size).filter((l): l is number => l != null && !Number.isNaN(l));

  const avg = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0;
  const sd = stdDev(risks);
  const cv = avg > 0 ? sd / avg : 0;
  const breaches = risks.filter((r) => r > configuredRiskCapPct).length;

  const lotAvg = lots.length ? lots.reduce((a, b) => a + b, 0) / lots.length : 0;
  const lotSd = stdDev(lots);
  const lotCv = lotAvg > 0 ? lotSd / lotAvg : 0;

  // Lower CV → higher consistency. Cap CV at 1.5 for scoring.
  const riskScore = Math.max(0, 100 - Math.min(1.5, cv) * 66.6);
  const lotScore = Math.max(0, 100 - Math.min(1.5, lotCv) * 66.6);

  return {
    sample: risks.length,
    avgRiskPct: avg,
    medianRiskPct: median(risks),
    largestRiskPct: risks.length ? Math.max(...risks) : 0,
    smallestRiskPct: risks.length ? Math.min(...risks) : 0,
    stdDevRiskPct: sd,
    coefficientOfVariation: cv,
    riskConsistencyScore: riskScore,
    breaches,
    breachRate: risks.length ? (breaches / risks.length) * 100 : 0,
    avgLotSize: lotAvg,
    stdDevLotSize: lotSd,
    positionSizeConsistencyScore: lotScore,
  };
}

export function riskDistribution(trades: AnalyticsTrade[]) {
  const buckets = [
    { key: "<0.25%", min: 0, max: 0.25 },
    { key: "0.25–0.5%", min: 0.25, max: 0.5 },
    { key: "0.5–1%", min: 0.5, max: 1 },
    { key: "1–2%", min: 1, max: 2 },
    { key: "2–3%", min: 2, max: 3 },
    { key: "3–5%", min: 3, max: 5 },
    { key: ">5%", min: 5, max: Infinity },
  ];
  const counts = buckets.map((b) => ({ bucket: b.key, count: 0, pnl: 0 }));
  for (const t of closedOnly(trades)) {
    if (t.risk_pct == null) continue;
    const idx = buckets.findIndex((b) => t.risk_pct! >= b.min && t.risk_pct! < b.max);
    if (idx >= 0) {
      counts[idx].count++;
      counts[idx].pnl += t.pnl;
    }
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Behavioural analytics                                                     */
/* -------------------------------------------------------------------------- */

export type BehaviourSeverity = "info" | "warn" | "danger";

export interface BehaviourFlag {
  key: string;
  label: string;
  description: string;
  count: number;
  rate: number;         // percentage of relevant trades
  severity: BehaviourSeverity;
  measurable: boolean;  // false when we cannot derive from available data
}

const OVERTRADING_THRESHOLD = 10;         // trades in a day
const CONSECUTIVE_LOSS_THRESHOLD = 3;

/**
 * Detect behavioural patterns from available Trading Engine / Journal data.
 * Any flag we cannot compute from current data is returned with
 * `measurable: false` — the panel renders them but marks them as "no data".
 */
export function computeBehaviourFlags(
  trades: AnalyticsTrade[],
  opts: { preferredSessions?: string[]; configuredRiskCapPct?: number } = {},
): BehaviourFlag[] {
  const list = closedOnly(trades).slice().sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
  const flags: BehaviourFlag[] = [];
  const total = list.length || 1;
  const winners = list.filter((t) => t.pnl > 0);
  const losers = list.filter((t) => t.pnl < 0);

  /* ---- Overtrading ---- */
  const perDay = new Map<string, number>();
  for (const t of list) {
    const d = new Date(t.closed_at!).toISOString().slice(0, 10);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const overDays = Array.from(perDay.values()).filter((n) => n >= OVERTRADING_THRESHOLD).length;
  flags.push({
    key: "overtrading",
    label: "Overtrading",
    description: `Days with ${OVERTRADING_THRESHOLD}+ trades — signal of impulsive trading.`,
    count: overDays,
    rate: perDay.size ? (overDays / perDay.size) * 100 : 0,
    severity: overDays > 0 ? "warn" : "info",
    measurable: perDay.size > 0,
  });

  /* ---- Cutting winners ---- */
  // Winners closed well below planned RR ×0.5.
  const cutWinners = winners.filter((t) => t.rr != null && Number(t.rr) < 0.5).length;
  flags.push({
    key: "cutting_winners",
    label: "Cutting winners short",
    description: "Winning trades exited before reaching ~0.5R of planned reward.",
    count: cutWinners,
    rate: winners.length ? (cutWinners / winners.length) * 100 : 0,
    severity: cutWinners > 0 && winners.length && cutWinners / winners.length > 0.3 ? "warn" : "info",
    measurable: winners.length > 0,
  });

  /* ---- Holding losers ---- */
  const avgWinDuration = winners.length
    ? winners.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0) / winners.length
    : 0;
  const heldLosers = losers.filter((t) => (t.duration_seconds ?? 0) > avgWinDuration * 1.5).length;
  flags.push({
    key: "holding_losers",
    label: "Holding losers",
    description: "Losing trades held ≥1.5× longer than the average winner.",
    count: heldLosers,
    rate: losers.length ? (heldLosers / losers.length) * 100 : 0,
    severity: heldLosers > 0 && losers.length && heldLosers / losers.length > 0.3 ? "danger" : "info",
    measurable: losers.length > 0 && winners.length > 0,
  });

  /* ---- Early exit — winners closed far from TP ---- */
  let earlyExits = 0, earlyEligible = 0;
  for (const t of winners) {
    if (t.exit_price == null || t.take_profit == null || t.entry_price == null) continue;
    earlyEligible++;
    const total = Math.abs(t.take_profit - t.entry_price);
    const captured = Math.abs(t.exit_price - t.entry_price);
    if (total > 0 && captured / total < 0.5) earlyExits++;
  }
  flags.push({
    key: "early_exit",
    label: "Early exit",
    description: "Winners closed with <50% of the distance to take-profit captured.",
    count: earlyExits,
    rate: earlyEligible ? (earlyExits / earlyEligible) * 100 : 0,
    severity: earlyEligible && earlyExits / earlyEligible > 0.4 ? "warn" : "info",
    measurable: earlyEligible > 0,
  });

  /* ---- Late exit — losers well past SL ---- */
  let lateExits = 0, lateEligible = 0;
  for (const t of losers) {
    if (t.exit_price == null || t.stop_loss == null || t.entry_price == null) continue;
    lateEligible++;
    const risk = Math.abs(t.entry_price - t.stop_loss);
    const damage = Math.abs(t.exit_price - t.entry_price);
    if (risk > 0 && damage > risk * 1.25) lateExits++;
  }
  flags.push({
    key: "late_exit",
    label: "Late exit",
    description: "Losers exited beyond the original stop-loss by >25% — stop pulled/violated.",
    count: lateExits,
    rate: lateEligible ? (lateExits / lateEligible) * 100 : 0,
    severity: lateExits > 0 ? "danger" : "info",
    measurable: lateEligible > 0,
  });

  /* ---- Consecutive-loss behaviour: does risk rise after loss streaks? ---- */
  let riskAfterLossSum = 0, riskAfterLossCount = 0, streak = 0;
  for (const t of list) {
    if (streak >= CONSECUTIVE_LOSS_THRESHOLD && t.risk_pct != null) {
      riskAfterLossSum += t.risk_pct;
      riskAfterLossCount++;
    }
    if (t.pnl < 0) streak++;
    else streak = 0;
  }
  const baselineRisk = (() => {
    const rs = list.map((t) => t.risk_pct).filter((r): r is number => r != null);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  })();
  const revengeRisk = riskAfterLossCount ? riskAfterLossSum / riskAfterLossCount : 0;
  const revengeSpike = baselineRisk > 0 && revengeRisk > baselineRisk * 1.25;
  flags.push({
    key: "revenge_trading",
    label: "Revenge trading",
    description: `Risk-per-trade after ${CONSECUTIVE_LOSS_THRESHOLD}+ losses in a row exceeds baseline by 25%+.`,
    count: riskAfterLossCount,
    rate: revengeRisk,
    severity: revengeSpike ? "danger" : "info",
    measurable: riskAfterLossCount > 0,
  });

  /* ---- Trading outside preferred sessions ---- */
  const preferred = opts.preferredSessions ?? [];
  if (preferred.length) {
    const outside = list.filter((t) => t.session != null && !preferred.includes(t.session)).length;
    flags.push({
      key: "session_breach",
      label: "Off-session trading",
      description: `Trades taken outside preferred sessions (${preferred.join(", ")}).`,
      count: outside,
      rate: (outside / total) * 100,
      severity: outside / total > 0.3 ? "warn" : "info",
      measurable: true,
    });
  } else {
    flags.push({
      key: "session_breach",
      label: "Off-session trading",
      description: "Configure preferred sessions in Settings to enable detection.",
      count: 0,
      rate: 0,
      severity: "info",
      measurable: false,
    });
  }

  /* ---- Risk cap breach ---- */
  const cap = opts.configuredRiskCapPct ?? 2;
  const breach = list.filter((t) => t.risk_pct != null && t.risk_pct > cap).length;
  flags.push({
    key: "risk_breach",
    label: "Risk cap breach",
    description: `Trades that risked more than ${cap.toFixed(2)}% of equity.`,
    count: breach,
    rate: (breach / total) * 100,
    severity: breach > 0 ? "danger" : "info",
    measurable: list.some((t) => t.risk_pct != null),
  });

  /* ---- Moving SL / TP requires an event history we don't yet store ---- */
  flags.push({
    key: "moving_sl",
    label: "Moving stop-loss",
    description: "Requires trade event history — will be captured once order-modification events are persisted.",
    count: 0, rate: 0, severity: "info", measurable: false,
  });
  flags.push({
    key: "moving_tp",
    label: "Moving take-profit",
    description: "Requires trade event history — will be captured once order-modification events are persisted.",
    count: 0, rate: 0, severity: "info", measurable: false,
  });

  return flags;
}

/* -------------------------------------------------------------------------- */
/*  Realized vs floating (uses trade status)                                  */
/* -------------------------------------------------------------------------- */

export function realizedVsFloating(trades: AnalyticsTrade[]) {
  const realized = trades.filter((t) => t.closed_at != null).reduce((sum, t) => sum + t.pnl, 0);
  const floating = trades.filter((t) => t.closed_at == null).reduce((sum, t) => sum + (t.pnl || 0), 0);
  return { realized, floating, total: realized + floating };
}

/* -------------------------------------------------------------------------- */
/*  Account comparison                                                        */
/* -------------------------------------------------------------------------- */

export interface AccountComparisonRow {
  accountId: string;
  netProfit: number;
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  avgRiskPct: number;
}

export function compareAccounts(
  trades: AnalyticsTrade[],
  accountIds: string[],
): AccountComparisonRow[] {
  return accountIds.map((id) => {
    const subset = trades.filter((t) => t.account_id === id);
    const k = computeKpis(subset);
    const risks = subset.map((t) => t.risk_pct).filter((r): r is number => r != null);
    return {
      accountId: id,
      netProfit: k.netProfit,
      trades: k.totalTrades,
      winRate: k.winRate,
      profitFactor: k.profitFactor,
      expectancy: k.expectancy,
      maxDrawdown: k.maxDrawdown,
      avgRiskPct: risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Convenience: equity curve → balance vs floating series                    */
/* -------------------------------------------------------------------------- */

export function equityAndDrawdownSeries(trades: AnalyticsTrade[], startingBalance = 0) {
  const eq = computeEquityCurve(trades, startingBalance);
  return eq.map((p) => ({
    date: p.date,
    equity: p.equity,
    balance: p.equity, // realized-only in this dataset; floating is added by consumer
    drawdown: -p.drawdown,
  }));
}
