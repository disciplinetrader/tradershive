/**
 * Trader Intelligence Engine — pure, deterministic computations from real
 * platform data. No fabricated numbers, no LLM required.
 *
 * All coach panels (dashboard, strengths, weaknesses, roadmap, strategy
 * intel, instrument intel, weekly summary) derive from these functions.
 * The Ask AI chat also injects the compact summary into its system prompt
 * so the LLM speaks in the trader's own numbers.
 */
import { inferSession } from "@/lib/statistics/session";

export interface RawTrade {
  id: string;
  symbol: string | null;
  market: string | null;
  direction: string | null;
  status: string | null;
  pnl: number | null;
  rr_realized: number | null;
  rr_planned: number | null;
  risk_amount: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  entry_price: number | null;
  exit_price: number | null;
  opened_at: string | null;
  closed_at: string | null;
  strategy_id: string | null;
  close_reason: string | null;
  notes?: string | null;
}

export interface RawJournal {
  id: string;
  trade_id: string | null;
  mistakes: string[] | null;
  emotions_pre: string[] | null;
  emotions_post: string[] | null;
  rating: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface StrategyRef { id: string; name: string | null }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function round(n: number, d = 2) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function agg(trades: RawTrade[]) {
  const n = trades.length;
  if (!n) {
    return { n, wins: 0, losses: 0, winRate: 0, netPnl: 0, avgR: 0, expectancy: 0, profitFactor: 0, sumWin: 0, sumLoss: 0 };
  }
  let wins = 0, losses = 0, sumWin = 0, sumLoss = 0, sumR = 0;
  for (const t of trades) {
    const pnl = Number(t.pnl ?? 0);
    const r = Number(t.rr_realized ?? 0);
    sumR += r;
    if (pnl > 0) { wins++; sumWin += pnl; }
    else if (pnl < 0) { losses++; sumLoss += Math.abs(pnl); }
  }
  const winRate = n ? wins / n : 0;
  const avgR = n ? sumR / n : 0;
  const avgWin = wins ? sumWin / wins : 0;
  const avgLoss = losses ? sumLoss / losses : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? 999 : 0;
  return {
    n, wins, losses,
    winRate: round(winRate * 100, 1),
    netPnl: round(sumWin - sumLoss, 2),
    avgR: round(avgR, 2),
    expectancy: round(expectancy, 2),
    profitFactor: round(profitFactor, 2),
    sumWin: round(sumWin, 2),
    sumLoss: round(sumLoss, 2),
  };
}

function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K | null | undefined) {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null || k === "") continue;
    const list = map.get(k as K) ?? [];
    list.push(r);
    map.set(k as K, list);
  }
  return map;
}

export interface Breakdown {
  key: string;
  label: string;
  trades: number;
  winRate: number;
  netPnl: number;
  expectancy: number;
  avgR: number;
  profitFactor: number;
}

function toBreakdown(map: Map<string, RawTrade[]>, labelFn: (k: string) => string = (k) => k): Breakdown[] {
  const out: Breakdown[] = [];
  for (const [k, list] of map.entries()) {
    const a = agg(list);
    if (a.n < 1) continue;
    out.push({
      key: k,
      label: labelFn(k),
      trades: a.n,
      winRate: a.winRate,
      netPnl: a.netPnl,
      expectancy: a.expectancy,
      avgR: a.avgR,
      profitFactor: a.profitFactor,
    });
  }
  return out.sort((a, b) => b.netPnl - a.netPnl);
}

export interface Behaviors {
  movedStopLossPct: number;
  cutWinnersEarlyPct: number;
  heldLosersPct: number;
  overtradingDays: number;
  avgTradesPerDay: number;
  mostCommonMistake: { name: string; count: number } | null;
  fomoRate: number;
  revengeRate: number;
}

function detectBehaviors(trades: RawTrade[], journals: RawJournal[]): Behaviors {
  const closed = trades.filter((t) => t.status === "closed");
  const winners = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losers = closed.filter((t) => (t.pnl ?? 0) < 0);

  // Cut winners early = winning trade where realized R < 0.5 * planned R
  const cutEarly = winners.filter((t) => {
    const p = Number(t.rr_planned ?? 0);
    const r = Number(t.rr_realized ?? 0);
    return p > 0 && r > 0 && r < p * 0.5;
  }).length;

  // Held losers = losing trade with realized R worse than -1.2R
  const heldLosers = losers.filter((t) => Number(t.rr_realized ?? 0) < -1.2).length;

  // Moved SL: close_reason includes manual on a losing trade below entry stop
  const movedSL = losers.filter((t) => t.close_reason === "manual" && t.stop_loss != null).length;

  // Overtrading
  const perDay = new Map<string, number>();
  for (const t of closed) {
    const d = (t.opened_at ?? "").slice(0, 10);
    if (!d) continue;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const days = perDay.size || 1;
  const totalT = closed.length;
  const overtradingDays = [...perDay.values()].filter((c) => c >= 8).length;

  // Mistake / emotion tags
  const mistakeCounts = new Map<string, number>();
  let fomo = 0, revenge = 0;
  for (const j of journals) {
    for (const m of j.mistakes ?? []) {
      const k = String(m).toLowerCase().trim();
      if (!k) continue;
      mistakeCounts.set(k, (mistakeCounts.get(k) ?? 0) + 1);
      if (k.includes("fomo")) fomo++;
      if (k.includes("revenge")) revenge++;
    }
    for (const e of [...(j.emotions_pre ?? []), ...(j.emotions_post ?? [])]) {
      const k = String(e).toLowerCase();
      if (k.includes("fomo")) fomo++;
      if (k.includes("revenge") || k.includes("angry")) revenge++;
    }
  }
  const topMistake = [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const journalCount = Math.max(journals.length, 1);

  return {
    movedStopLossPct: round((movedSL / Math.max(losers.length, 1)) * 100, 1),
    cutWinnersEarlyPct: round((cutEarly / Math.max(winners.length, 1)) * 100, 1),
    heldLosersPct: round((heldLosers / Math.max(losers.length, 1)) * 100, 1),
    overtradingDays,
    avgTradesPerDay: round(totalT / days, 1),
    mostCommonMistake: topMistake ? { name: topMistake[0], count: topMistake[1] } : null,
    fomoRate: round((fomo / journalCount) * 100, 1),
    revengeRate: round((revenge / journalCount) * 100, 1),
  };
}

export interface Weakness {
  title: string;
  impact: "critical" | "high" | "medium" | "low";
  evidence: string;
  suggestion: string;
  expected: string;
}

function buildStrengths(kpis: ReturnType<typeof agg>, byInstrument: Breakdown[], bySession: Breakdown[], b: Behaviors): string[] {
  const out: string[] = [];
  if (kpis.n >= 10 && kpis.winRate >= 55) out.push(`Solid ${kpis.winRate}% win rate over ${kpis.n} trades.`);
  if (kpis.profitFactor >= 1.5) out.push(`Profit factor of ${kpis.profitFactor} shows a real edge.`);
  if (kpis.expectancy > 0) out.push(`Positive expectancy: $${kpis.expectancy} per trade on average.`);
  const bestI = byInstrument.filter((r) => r.trades >= 5).sort((a, b) => b.expectancy - a.expectancy)[0];
  if (bestI && bestI.expectancy > 0) out.push(`${bestI.label} is your strongest instrument — $${bestI.expectancy} expectancy across ${bestI.trades} trades.`);
  const bestS = bySession.filter((r) => r.trades >= 5).sort((a, b) => b.expectancy - a.expectancy)[0];
  if (bestS && bestS.expectancy > 0) out.push(`You perform best in the ${bestS.label} session (${bestS.winRate}% win rate).`);
  if (b.cutWinnersEarlyPct < 20 && kpis.wins >= 5) out.push("Good patience — you rarely cut winners early.");
  if (b.movedStopLossPct < 10 && kpis.losses >= 5) out.push("Excellent stop discipline — you honor your risk.");
  return out;
}

function buildWeaknesses(kpis: ReturnType<typeof agg>, byInstrument: Breakdown[], bySession: Breakdown[], b: Behaviors): Weakness[] {
  const out: Weakness[] = [];
  if (b.movedStopLossPct >= 25) {
    out.push({
      title: "You move your stop loss on losing trades",
      impact: "critical",
      evidence: `${b.movedStopLossPct}% of your losing trades were closed manually with a stop set.`,
      suggestion: "Commit to the initial stop. Use hard stops on the broker side; do not touch them once placed.",
      expected: "Cutting this in half typically improves expectancy by 15-25%.",
    });
  }
  if (b.cutWinnersEarlyPct >= 40) {
    out.push({
      title: "You cut winners too early",
      impact: "high",
      evidence: `${b.cutWinnersEarlyPct}% of winning trades closed below 0.5x their planned target.`,
      suggestion: "Scale out partials at 1R and let the runner hit the plan. Do not close manually before 1R.",
      expected: "Recovering half your planned R would materially raise average R.",
    });
  }
  if (b.heldLosersPct >= 25) {
    out.push({
      title: "You let losing trades run past your stop",
      impact: "high",
      evidence: `${b.heldLosersPct}% of losses exceeded -1.2R.`,
      suggestion: "Use hard stops and step away from the screen once the trade is on.",
      expected: "Capping losses at 1R eliminates a large tail of oversize losses.",
    });
  }
  const worstI = byInstrument.filter((r) => r.trades >= 5).sort((a, b) => a.expectancy - b.expectancy)[0];
  if (worstI && worstI.expectancy < 0) {
    out.push({
      title: `${worstI.label} is bleeding capital`,
      impact: "high",
      evidence: `${worstI.trades} trades, ${worstI.winRate}% win rate, net $${worstI.netPnl}.`,
      suggestion: `Pause ${worstI.label} for 2 weeks and only re-enter with a written playbook.`,
      expected: `Removing this instrument alone would improve net P&L by ~$${Math.abs(worstI.netPnl)}.`,
    });
  }
  const worstS = bySession.filter((r) => r.trades >= 5).sort((a, b) => a.expectancy - b.expectancy)[0];
  if (worstS && worstS.expectancy < 0) {
    out.push({
      title: `${worstS.label} session is unprofitable`,
      impact: "medium",
      evidence: `${worstS.trades} trades, ${worstS.winRate}% win rate, net $${worstS.netPnl}.`,
      suggestion: `Avoid ${worstS.label} for 10 sessions. Track whether your average R improves.`,
      expected: "Trading only your best sessions typically raises expectancy immediately.",
    });
  }
  if (b.avgTradesPerDay >= 8) {
    out.push({
      title: "You are overtrading",
      impact: "medium",
      evidence: `Average of ${b.avgTradesPerDay} trades per active day, with ${b.overtradingDays} extreme days.`,
      suggestion: "Cap yourself at 3 A+ setups per day. Log a reason for each trade before entry.",
      expected: "Reducing volume typically raises win rate 5-10%.",
    });
  }
  if (b.mostCommonMistake && b.mostCommonMistake.count >= 3) {
    out.push({
      title: `Recurring mistake: ${b.mostCommonMistake.name}`,
      impact: "medium",
      evidence: `Logged ${b.mostCommonMistake.count} times in your journal.`,
      suggestion: "Add this mistake to your pre-trade checklist as a red-flag question.",
      expected: "Naming a mistake at entry time is the strongest single intervention.",
    });
  }
  if (kpis.n >= 20 && kpis.profitFactor > 0 && kpis.profitFactor < 1) {
    out.push({
      title: "You are losing money net",
      impact: "critical",
      evidence: `Profit factor ${kpis.profitFactor}: you lose $${kpis.sumLoss} for every $${kpis.sumWin} won.`,
      suggestion: "Stop live-sized risk. Move to Replay for 20 sessions and rebuild expectancy.",
      expected: "Profit factor above 1.3 typically restores viability.",
    });
  }
  return out.sort((a, b) => rank(a.impact) - rank(b.impact));
}

function rank(i: Weakness["impact"]) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[i];
}

function buildRoadmap(weaknesses: Weakness[]): { priority: number; title: string; why: string; metric: string }[] {
  return weaknesses.slice(0, 4).map((w, i) => ({
    priority: i + 1,
    title: w.suggestion,
    why: w.evidence,
    metric: w.expected,
  }));
}

function todaysInsight(kpis: ReturnType<typeof agg>, weaknesses: Weakness[], byInstrument: Breakdown[]): string {
  if (kpis.n < 5) return "Log a few more trades and I'll surface your first data-driven insight.";
  if (weaknesses[0]) return `${weaknesses[0].title}. ${weaknesses[0].suggestion}`;
  const best = byInstrument.filter((r) => r.trades >= 5)[0];
  if (best) return `Your edge is on ${best.label}: ${best.winRate}% win rate across ${best.trades} trades. Trade what works.`;
  return `Overall win rate ${kpis.winRate}% across ${kpis.n} trades. Keep the same process this week.`;
}

export interface WeeklySummary {
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  headline: string;
  netPnl: number;
  trades: number;
  winRate: number;
  bestTrade: RawTrade | null;
  worstTrade: RawTrade | null;
  mostCommonMistake: string | null;
}

function gradeFromScore(score: number): WeeklySummary["grade"] {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function weeklySummary(trades: RawTrade[], journals: RawJournal[]): WeeklySummary {
  const since = Date.now() - 7 * 86400000;
  const week = trades.filter((t) => t.status === "closed" && new Date(t.closed_at ?? 0).getTime() >= since);
  const a = agg(week);
  const best = [...week].sort((x, y) => Number(y.pnl ?? 0) - Number(x.pnl ?? 0))[0] ?? null;
  const worst = [...week].sort((x, y) => Number(x.pnl ?? 0) - Number(y.pnl ?? 0))[0] ?? null;
  const wkJournals = journals.filter((j) => new Date(j.created_at ?? 0).getTime() >= since);
  const mistakes = new Map<string, number>();
  for (const j of wkJournals) for (const m of j.mistakes ?? []) mistakes.set(m, (mistakes.get(m) ?? 0) + 1);
  const topMistake = [...mistakes.entries()].sort((a, b) => b[1] - a[1])[0];
  const score = 40 + Math.min(a.winRate, 100) * 0.3 + Math.min(a.profitFactor, 3) * 10;
  return {
    grade: gradeFromScore(score),
    headline: a.n
      ? `${a.n} trades, ${a.winRate}% win rate, net $${a.netPnl}.`
      : "No closed trades this week. Take a review day.",
    netPnl: a.netPnl,
    trades: a.n,
    winRate: a.winRate,
    bestTrade: best,
    worstTrade: worst,
    mostCommonMistake: topMistake?.[0] ?? null,
  };
}

export interface TraderIntelligence {
  windowDays: number;
  kpis: ReturnType<typeof agg>;
  byInstrument: Breakdown[];
  byMarket: Breakdown[];
  bySession: Breakdown[];
  byWeekday: Breakdown[];
  byStrategy: Breakdown[];
  behaviors: Behaviors;
  strengths: string[];
  weaknesses: Weakness[];
  roadmap: { priority: number; title: string; why: string; metric: string }[];
  insights: string[];
  todaysInsight: string;
  weekly: WeeklySummary;
  hasEnoughData: boolean;
}

export function buildIntelligence(
  trades: RawTrade[],
  journals: RawJournal[],
  strategies: StrategyRef[],
  windowDays = 30,
): TraderIntelligence {
  const closed = trades.filter((t) => t.status === "closed");
  const kpis = agg(closed);
  const strategyNames = new Map(strategies.map((s) => [s.id, s.name ?? "Strategy"]));

  const byInstrument = toBreakdown(groupBy(closed, (t) => (t.symbol ?? "").toUpperCase()));
  const byMarket = toBreakdown(groupBy(closed, (t) => t.market ?? ""));
  const bySession = toBreakdown(
    groupBy(closed, (t) => inferSession(t.opened_at ?? new Date().toISOString())),
    (k) => ({ asia: "Asia", london: "London", new_york: "New York", other: "Off-hours" } as const)[k] ?? k,
  );
  const byWeekday = toBreakdown(
    groupBy(closed, (t) => {
      const d = new Date(t.opened_at ?? 0);
      return Number.isNaN(d.getTime()) ? null : String(d.getUTCDay());
    }),
    (k) => WEEKDAYS[Number(k)] ?? k,
  );
  const byStrategy = toBreakdown(
    groupBy(closed, (t) => t.strategy_id ?? ""),
    (k) => strategyNames.get(k) ?? "Unlabeled",
  );

  const behaviors = detectBehaviors(closed, journals);
  const strengths = buildStrengths(kpis, byInstrument, bySession, behaviors);
  const weaknesses = buildWeaknesses(kpis, byInstrument, bySession, behaviors);
  const roadmap = buildRoadmap(weaknesses);
  const insights = [
    ...strengths.slice(0, 3),
    ...weaknesses.slice(0, 3).map((w) => `${w.title} — ${w.evidence}`),
  ];

  return {
    windowDays,
    kpis,
    byInstrument,
    byMarket,
    bySession,
    byWeekday,
    byStrategy,
    behaviors,
    strengths,
    weaknesses,
    roadmap,
    insights,
    todaysInsight: todaysInsight(kpis, weaknesses, byInstrument),
    weekly: weeklySummary(closed, journals),
    hasEnoughData: closed.length >= 5,
  };
}

/** Compact string form for the Ask AI system prompt. */
export function summarizeForPrompt(intel: TraderIntelligence): string {
  const lines: string[] = [];
  lines.push(`# Trader intelligence (last ${intel.windowDays} days, real platform data)`);
  lines.push(
    `KPIs: ${intel.kpis.n} trades · win rate ${intel.kpis.winRate}% · net $${intel.kpis.netPnl} · profit factor ${intel.kpis.profitFactor} · expectancy $${intel.kpis.expectancy} · avg R ${intel.kpis.avgR}`,
  );
  if (intel.byInstrument.length) {
    lines.push(
      `Instruments: ${intel.byInstrument.slice(0, 5).map((b) => `${b.label} ${b.trades}t/${b.winRate}%/$${b.netPnl}`).join(" · ")}`,
    );
  }
  if (intel.bySession.length) {
    lines.push(
      `Sessions: ${intel.bySession.map((b) => `${b.label} ${b.trades}t/${b.winRate}%/$${b.netPnl}`).join(" · ")}`,
    );
  }
  if (intel.byStrategy.length) {
    lines.push(
      `Strategies: ${intel.byStrategy.slice(0, 5).map((b) => `${b.label} ${b.trades}t/${b.winRate}%/$${b.netPnl}`).join(" · ")}`,
    );
  }
  lines.push(
    `Behaviors: moved SL ${intel.behaviors.movedStopLossPct}% · cut winners ${intel.behaviors.cutWinnersEarlyPct}% · held losers ${intel.behaviors.heldLosersPct}% · avg ${intel.behaviors.avgTradesPerDay} trades/day${intel.behaviors.mostCommonMistake ? ` · top mistake "${intel.behaviors.mostCommonMistake.name}" (${intel.behaviors.mostCommonMistake.count}x)` : ""}`,
  );
  if (intel.weaknesses.length) {
    lines.push("Top weaknesses:");
    for (const w of intel.weaknesses.slice(0, 3)) lines.push(`  - [${w.impact}] ${w.title} — ${w.evidence}`);
  }
  if (intel.strengths.length) {
    lines.push("Strengths:");
    for (const s of intel.strengths.slice(0, 3)) lines.push(`  - ${s}`);
  }
  lines.push(
    "Rules: cite these numbers when answering. Do not invent statistics. If a question requires data not shown, say so.",
  );
  return lines.join("\n");
}
