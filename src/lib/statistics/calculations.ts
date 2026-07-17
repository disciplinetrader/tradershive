import type { AnalyticsTrade } from "./types";

export interface Kpis {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  netProfit: number;
  netR: number;
  winRate: number;
  profitFactor: number;
  avgRR: number;
  expectancy: number;
  avgHoldSeconds: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  currentStreak: { count: number; kind: "win" | "loss" | "flat" };
  longestWinStreak: number;
  longestLossStreak: number;
  avgDailyProfit: number;
  avgWinner: number;
  avgLoser: number;
  largestWinner: number;
  largestLoser: number;
  grossProfit: number;
  grossLoss: number;
}

function isWin(t: AnalyticsTrade) { return t.pnl > 0; }
function isLoss(t: AnalyticsTrade) { return t.pnl < 0; }

/** Only closed trades participate in analytics. */
export function closedOnly(trades: AnalyticsTrade[]): AnalyticsTrade[] {
  return trades.filter((t) => t.closed_at != null);
}

export function computeKpis(trades: AnalyticsTrade[]): Kpis {
  const list = closedOnly(trades).slice().sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
  const total = list.length;
  let wins = 0, losses = 0, be = 0;
  let grossProfit = 0, grossLoss = 0;
  let rSum = 0, rCount = 0;
  let holdSum = 0, holdCount = 0;
  let largestWinner = 0, largestLoser = 0;
  const dailyPnl = new Map<string, number>();

  for (const t of list) {
    const pnl = t.pnl;
    if (pnl > 0) { wins++; grossProfit += pnl; if (pnl > largestWinner) largestWinner = pnl; }
    else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); if (pnl < largestLoser) largestLoser = pnl; }
    else be++;
    if (t.rr != null) { rSum += Number(t.rr); rCount++; }
    if (t.duration_seconds != null) { holdSum += t.duration_seconds; holdCount++; }
    if (t.closed_at) {
      const d = new Date(t.closed_at).toISOString().slice(0, 10);
      dailyPnl.set(d, (dailyPnl.get(d) ?? 0) + pnl);
    }
  }

  const netProfit = grossProfit - grossLoss;
  const winRate = total ? (wins / total) * 100 : 0;
  const avgRR = rCount ? rSum / rCount : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWinner = wins ? grossProfit / wins : 0;
  const avgLoser = losses ? -grossLoss / losses : 0;
  const expectancy = total ? netProfit / total : 0;
  const avgHold = holdCount ? holdSum / holdCount : 0;

  // Drawdown from cumulative equity curve
  let peak = 0, cum = 0, maxDD = 0, curDD = 0;
  for (const t of list) {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    curDD = dd;
  }
  const maxDDPct = peak > 0 ? (maxDD / peak) * 100 : 0;

  // Streaks
  let longestWin = 0, longestLoss = 0, curWin = 0, curLoss = 0;
  for (const t of list) {
    if (isWin(t)) { curWin++; curLoss = 0; if (curWin > longestWin) longestWin = curWin; }
    else if (isLoss(t)) { curLoss++; curWin = 0; if (curLoss > longestLoss) longestLoss = curLoss; }
    else { curWin = 0; curLoss = 0; }
  }
  // Current streak — from newest backwards
  const rev = list.slice().reverse();
  let cs = 0;
  let csKind: "win" | "loss" | "flat" = "flat";
  for (const t of rev) {
    if (isWin(t)) { if (csKind === "loss") break; csKind = "win"; cs++; }
    else if (isLoss(t)) { if (csKind === "win") break; csKind = "loss"; cs++; }
    else break;
  }

  const avgDailyProfit = dailyPnl.size ? Array.from(dailyPnl.values()).reduce((a, b) => a + b, 0) / dailyPnl.size : 0;

  return {
    totalTrades: total,
    wins, losses, breakevens: be,
    netProfit, netR: rSum,
    winRate, profitFactor, avgRR, expectancy,
    avgHoldSeconds: avgHold,
    maxDrawdown: maxDD, maxDrawdownPct: maxDDPct, currentDrawdown: curDD,
    currentStreak: { count: cs, kind: csKind },
    longestWinStreak: longestWin, longestLossStreak: longestLoss,
    avgDailyProfit,
    avgWinner, avgLoser,
    largestWinner, largestLoser: Math.abs(largestLoser),
    grossProfit, grossLoss,
  };
}

/** Equity curve — cumulative pnl over time, starting from optional balance. */
export function computeEquityCurve(trades: AnalyticsTrade[], startingBalance = 0) {
  const list = closedOnly(trades).slice().sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
  let cum = startingBalance;
  let peak = startingBalance;
  const pts = list.map((t) => {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    return {
      date: t.closed_at!,
      equity: Number(cum.toFixed(2)),
      drawdown: Number((peak - cum).toFixed(2)),
      pnl: t.pnl,
    };
  });
  return pts;
}

export function groupByDay(trades: AnalyticsTrade[]) {
  const map = new Map<string, { date: string; pnl: number; trades: number; wins: number; losses: number; rr: number; rrCount: number }>();
  for (const t of closedOnly(trades)) {
    const d = new Date(t.closed_at!).toISOString().slice(0, 10);
    const cur = map.get(d) ?? { date: d, pnl: 0, trades: 0, wins: 0, losses: 0, rr: 0, rrCount: 0 };
    cur.pnl += t.pnl;
    cur.trades++;
    if (t.pnl > 0) cur.wins++;
    else if (t.pnl < 0) cur.losses++;
    if (t.rr != null) { cur.rr += Number(t.rr); cur.rrCount++; }
    map.set(d, cur);
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, avgRR: r.rrCount ? r.rr / r.rrCount : 0, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupByMonth(trades: AnalyticsTrade[]) {
  const map = new Map<string, { month: string; pnl: number; trades: number; wins: number; losses: number; rr: number; rrCount: number }>();
  for (const t of closedOnly(trades)) {
    const d = new Date(t.closed_at!);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) ?? { month: key, pnl: 0, trades: 0, wins: 0, losses: 0, rr: 0, rrCount: 0 };
    cur.pnl += t.pnl;
    cur.trades++;
    if (t.pnl > 0) cur.wins++;
    else if (t.pnl < 0) cur.losses++;
    if (t.rr != null) { cur.rr += Number(t.rr); cur.rrCount++; }
    map.set(key, cur);
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, avgRR: r.rrCount ? r.rr / r.rrCount : 0, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface GroupStats {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  netProfit: number;
  avgRR: number;
  bestTrade: number;
  worstTrade: number;
}

export function groupBy(trades: AnalyticsTrade[], keyFn: (t: AnalyticsTrade) => string | null | undefined): GroupStats[] {
  const map = new Map<string, GroupStats & { rrSum: number; rrCount: number }>();
  for (const t of closedOnly(trades)) {
    const k = keyFn(t);
    if (!k) continue;
    const cur = map.get(k) ?? {
      key: k, trades: 0, wins: 0, losses: 0, breakevens: 0, winRate: 0,
      netProfit: 0, avgRR: 0, bestTrade: -Infinity, worstTrade: Infinity, rrSum: 0, rrCount: 0,
    };
    cur.trades++;
    cur.netProfit += t.pnl;
    if (t.pnl > 0) cur.wins++;
    else if (t.pnl < 0) cur.losses++;
    else cur.breakevens++;
    if (t.pnl > cur.bestTrade) cur.bestTrade = t.pnl;
    if (t.pnl < cur.worstTrade) cur.worstTrade = t.pnl;
    if (t.rr != null) { cur.rrSum += Number(t.rr); cur.rrCount++; }
    map.set(k, cur);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
    avgRR: r.rrCount ? r.rrSum / r.rrCount : 0,
    bestTrade: r.bestTrade === -Infinity ? 0 : r.bestTrade,
    worstTrade: r.worstTrade === Infinity ? 0 : r.worstTrade,
  }));
}

export function rMultipleHistogram(trades: AnalyticsTrade[]) {
  const buckets = [
    { key: "<-3R", min: -Infinity, max: -3 },
    { key: "-3R", min: -3, max: -2 },
    { key: "-2R", min: -2, max: -1 },
    { key: "-1R", min: -1, max: 0 },
    { key: "0R", min: 0, max: 1 },
    { key: "+1R", min: 1, max: 2 },
    { key: "+2R", min: 2, max: 3 },
    { key: "+3R", min: 3, max: 4 },
    { key: ">+3R", min: 4, max: Infinity },
  ];
  const counts = buckets.map((b) => ({ bucket: b.key, count: 0 }));
  for (const t of closedOnly(trades)) {
    if (t.rr == null) continue;
    const r = Number(t.rr);
    const idx = buckets.findIndex((b) => r >= b.min && r < b.max);
    if (idx >= 0) counts[idx].count++;
  }
  return counts;
}

export function timeOfDayBuckets(trades: AnalyticsTrade[]) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, trades: 0, pnl: 0, wins: 0 }));
  for (const t of closedOnly(trades)) {
    const h = new Date(t.opened_at).getHours();
    hours[h].trades++;
    hours[h].pnl += t.pnl;
    if (t.pnl > 0) hours[h].wins++;
  }
  return hours;
}

export function weekdayBuckets(trades: AnalyticsTrade[]) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = names.map((n, i) => ({ day: n, idx: i, trades: 0, pnl: 0, wins: 0 }));
  for (const t of closedOnly(trades)) {
    const d = new Date(t.closed_at!).getDay();
    days[d].trades++;
    days[d].pnl += t.pnl;
    if (t.pnl > 0) days[d].wins++;
  }
  return days;
}

export function calendarByDay(trades: AnalyticsTrade[]) {
  const map = new Map<string, { date: string; pnl: number; trades: number; wins: number; losses: number }>();
  for (const t of closedOnly(trades)) {
    const d = new Date(t.closed_at!).toISOString().slice(0, 10);
    const cur = map.get(d) ?? { date: d, pnl: 0, trades: 0, wins: 0, losses: 0 };
    cur.pnl += t.pnl;
    cur.trades++;
    if (t.pnl > 0) cur.wins++;
    else if (t.pnl < 0) cur.losses++;
    map.set(d, cur);
  }
  return map;
}
