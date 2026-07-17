import type { RankingCategory } from "./constants";

export interface TradeAgg {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  rSum: number;
  rCount: number;
  disciplinedCount: number;
  monthlyPnl: Record<string, number>;
}

export interface UserStats {
  totalTrades: number;
  winRate: number; // 0..1
  profitFactor: number;
  netR: number;
  profit: number;
  avgRR: number;
  consistency: number; // 0..1
  discipline: number; // 0..1
}

export function emptyAgg(): TradeAgg {
  return {
    totalTrades: 0, wins: 0, losses: 0, breakevens: 0,
    netProfit: 0, grossProfit: 0, grossLoss: 0,
    rSum: 0, rCount: 0, disciplinedCount: 0,
    monthlyPnl: {},
  };
}

type ClosedTrade = { pnl: number | null; rr: number | null; closed_at: string | null };
type JournalRow = { grade: string | null; followed_plan: boolean | null; pnl: number | null };

export function aggregateTrades(trades: ClosedTrade[], journal: JournalRow[]): TradeAgg {
  const agg = emptyAgg();
  const journalByPlan = journal.filter((j) => j.followed_plan != null);
  for (const t of trades) {
    if (t.closed_at == null) continue;
    agg.totalTrades += 1;
    const pnl = Number(t.pnl ?? 0);
    agg.netProfit += pnl;
    if (pnl > 0) { agg.wins += 1; agg.grossProfit += pnl; }
    else if (pnl < 0) { agg.losses += 1; agg.grossLoss += Math.abs(pnl); }
    else agg.breakevens += 1;
    if (t.rr != null) { agg.rSum += Number(t.rr); agg.rCount += 1; }
    const month = t.closed_at.slice(0, 7);
    agg.monthlyPnl[month] = (agg.monthlyPnl[month] ?? 0) + pnl;
  }
  agg.disciplinedCount = journalByPlan.filter((j) => j.followed_plan === true).length;
  return agg;
}

export function statsFromAgg(agg: TradeAgg, journalPlanCount: number): UserStats {
  const winRate = agg.totalTrades > 0 ? agg.wins / agg.totalTrades : 0;
  const profitFactor = agg.grossLoss > 0 ? agg.grossProfit / agg.grossLoss : (agg.grossProfit > 0 ? 999 : 0);
  const avgRR = agg.rCount > 0 ? agg.rSum / agg.rCount : 0;
  // Consistency: 1 - normalized stddev of monthly PnL (only when >=3 months)
  const months = Object.values(agg.monthlyPnl);
  let consistency = 0;
  if (months.length >= 3) {
    const mean = months.reduce((a, b) => a + b, 0) / months.length;
    const variance = months.reduce((a, b) => a + (b - mean) ** 2, 0) / months.length;
    const stdev = Math.sqrt(variance);
    const denom = Math.max(1, Math.abs(mean) + stdev);
    consistency = Math.max(0, Math.min(1, 1 - stdev / (denom * 2)));
  }
  const discipline = journalPlanCount > 0 ? agg.disciplinedCount / journalPlanCount : 0;
  return {
    totalTrades: agg.totalTrades,
    winRate, profitFactor, netR: agg.rSum,
    profit: agg.netProfit, avgRR, consistency, discipline,
  };
}

export function categoryValue(
  category: RankingCategory,
  profile: { xp: number; streak: number },
  stats: UserStats,
  extra: { achievements: number; journalScore: number; challengeScore: number },
): number {
  switch (category) {
    case "xp": return profile.xp;
    case "streak": return profile.streak;
    case "win_rate": return stats.winRate;
    case "profit_factor": return stats.profitFactor;
    case "net_r": return stats.netR;
    case "profit": return stats.profit;
    case "consistency": return stats.consistency;
    case "discipline": return stats.discipline;
    case "achievements": return extra.achievements;
    case "journal_score": return extra.journalScore;
    case "challenge_score": return extra.challengeScore;
  }
}
