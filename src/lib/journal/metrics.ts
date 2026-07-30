import type { JournalEntry } from "@/lib/journal/api";

export type JournalSummary = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
  winRate: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  journaledPct: number;
  drafts: number;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function summarize(entries: JournalEntry[]): JournalSummary {
  const trades = entries.length;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let netPnl = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let rrSum = 0;
  let rrCount = 0;
  let best = 0;
  let worst = 0;
  let journaled = 0;
  let drafts = 0;

  for (const e of entries) {
    const pnl = num(e.pnl);
    netPnl += pnl;
    if (pnl > 0) {
      wins += 1;
      grossWin += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(pnl);
    } else {
      breakeven += 1;
    }
    if (typeof e.rr === "number" && Number.isFinite(e.rr)) {
      rrSum += e.rr;
      rrCount += 1;
    }
    best = Math.max(best, pnl);
    worst = Math.min(worst, pnl);
    if ((e.notes_text?.trim().length ?? 0) > 0 || (e.entry_reason_text?.trim().length ?? 0) > 0) journaled += 1;
    if (e.status === "draft") drafts += 1;
  }

  const decided = wins + losses;
  const winRate = decided ? (wins / decided) * 100 : 0;
  const avgWin = wins ? grossWin / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;

  return {
    trades,
    wins,
    losses,
    breakeven,
    netPnl,
    winRate,
    avgRR: rrCount ? rrSum / rrCount : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: trades ? netPnl / trades : 0,
    avgWin,
    avgLoss,
    bestTrade: best,
    worstTrade: worst,
    journaledPct: trades ? (journaled / trades) * 100 : 0,
    drafts,
  };
}

export type HiveScore = {
  total: number;
  discipline: number;
  consistency: number;
  risk: number;
  execution: number;
  journaling: number;
  sample: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Proprietary 0-100 behaviour score. Weighted blend of five drivers. */
export function hiveScore(entries: JournalEntry[]): HiveScore {
  const scored = entries.filter((e) => e.status !== "draft");
  const sample = scored.length;
  if (!sample) {
    return { total: 0, discipline: 0, consistency: 0, risk: 0, execution: 0, journaling: 0, sample: 0 };
  }

  // Discipline — self-rated discipline + absence of logged mistakes.
  const disciplineRatings = scored.filter((e) => typeof e.discipline === "number");
  const ratedDiscipline = disciplineRatings.length
    ? (disciplineRatings.reduce((a, e) => a + num(e.discipline), 0) / disciplineRatings.length) * 10
    : 60;
  const cleanTrades = scored.filter((e) => (e.mistakes?.length ?? 0) === 0).length;
  const discipline = clamp(ratedDiscipline * 0.5 + (cleanTrades / sample) * 100 * 0.5);

  // Consistency — how stable per-trade results are around the mean.
  const pnls = scored.map((e) => num(e.pnl));
  const mean = pnls.reduce((a, b) => a + b, 0) / sample;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / sample;
  const sd = Math.sqrt(variance);
  const spread = sd === 0 ? 0 : sd / (Math.abs(mean) || sd);
  const consistency = clamp(100 - Math.min(spread, 3) * 30);

  // Risk — respecting a sane per-trade risk budget and positive R.
  const riskEntries = scored.filter((e) => typeof e.risk_pct === "number");
  const withinBudget = riskEntries.filter((e) => num(e.risk_pct) > 0 && num(e.risk_pct) <= 2).length;
  const riskBase = riskEntries.length ? (withinBudget / riskEntries.length) * 100 : 60;
  const rrEntries = scored.filter((e) => typeof e.rr === "number");
  const avgRR = rrEntries.length ? rrEntries.reduce((a, e) => a + num(e.rr), 0) / rrEntries.length : 0;
  const risk = clamp(riskBase * 0.7 + Math.min(Math.max(avgRR, 0) / 2, 1) * 100 * 0.3);

  // Execution — entry/exit quality plus grades.
  const gradePoints: Record<string, number> = { A: 100, B: 80, C: 60, D: 40, F: 15 };
  const graded = scored.filter((e) => e.grade && gradePoints[String(e.grade).toUpperCase()] !== undefined);
  const gradeAvg = graded.length
    ? graded.reduce((a, e) => a + gradePoints[String(e.grade).toUpperCase()], 0) / graded.length
    : 60;
  const quality = scored.filter((e) => typeof e.entry_quality === "number" || typeof e.exit_quality === "number");
  const qualityAvg = quality.length
    ? (quality.reduce((a, e) => a + (num(e.entry_quality) + num(e.exit_quality)) / 2, 0) / quality.length) * 10
    : 60;
  const execution = clamp(gradeAvg * 0.6 + qualityAvg * 0.4);

  // Journaling — did the trade get a story?
  const journaling = clamp(summarize(scored).journaledPct);

  const total = clamp(
    discipline * 0.3 + consistency * 0.15 + risk * 0.25 + execution * 0.2 + journaling * 0.1,
  );

  return { total, discipline, consistency, risk, execution, journaling, sample };
}

export function scoreBand(score: number): { label: string; tone: "up" | "flat" | "down" } {
  if (score >= 80) return { label: "Elite", tone: "up" };
  if (score >= 65) return { label: "Solid", tone: "up" };
  if (score >= 50) return { label: "Developing", tone: "flat" };
  if (score > 0) return { label: "At risk", tone: "down" };
  return { label: "No data", tone: "flat" };
}

export type FrequencyRow = { key: string; count: number; pnl: number; winRate: number };

function frequency(entries: JournalEntry[], pick: (e: JournalEntry) => string[]): FrequencyRow[] {
  const map = new Map<string, { count: number; pnl: number; wins: number; decided: number }>();
  for (const e of entries) {
    for (const key of pick(e)) {
      if (!key) continue;
      const b = map.get(key) ?? { count: 0, pnl: 0, wins: 0, decided: 0 };
      b.count += 1;
      const pnl = num(e.pnl);
      b.pnl += pnl;
      if (pnl > 0) {
        b.wins += 1;
        b.decided += 1;
      } else if (pnl < 0) b.decided += 1;
      map.set(key, b);
    }
  }
  return Array.from(map.entries())
    .map(([key, b]) => ({ key, count: b.count, pnl: b.pnl, winRate: b.decided ? (b.wins / b.decided) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

export const mistakeBreakdown = (entries: JournalEntry[]) => frequency(entries, (e) => e.mistakes ?? []);
export const emotionBreakdown = (entries: JournalEntry[]) => frequency(entries, (e) => e.emotions ?? []);
export const setupBreakdown = (entries: JournalEntry[]) =>
  frequency(entries, (e) => (e.setup ? [e.setup] : []));
export const sessionBreakdown = (entries: JournalEntry[]) =>
  frequency(entries, (e) => (e.session ? [String(e.session)] : []));
export const symbolBreakdown = (entries: JournalEntry[]) =>
  frequency(entries, (e) => (e.symbol ? [e.symbol] : []));

export type DayBucket = {
  key: string;
  date: Date;
  ids: string[];
  pnl: number;
  wins: number;
  losses: number;
  breakeven: number;
  discipline: number | null;
  grade: string | null;
};

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function bucketByDay(entries: JournalEntry[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket & { disciplineSum: number; disciplineCount: number; gradeSum: number; gradeCount: number }>();
  const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const gradeLetters = ["F", "D", "C", "B", "A"];

  for (const e of entries) {
    const iso = e.closed_at ?? e.opened_at ?? e.created_at;
    if (!iso) continue;
    const date = new Date(iso);
    const key = dayKey(date);
    const b =
      map.get(key) ??
      ({
        key,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        ids: [],
        pnl: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        discipline: null,
        grade: null,
        disciplineSum: 0,
        disciplineCount: 0,
        gradeSum: 0,
        gradeCount: 0,
      } as DayBucket & { disciplineSum: number; disciplineCount: number; gradeSum: number; gradeCount: number });

    b.ids.push(e.id);
    const pnl = num(e.pnl);
    b.pnl += pnl;
    if (pnl > 0) b.wins += 1;
    else if (pnl < 0) b.losses += 1;
    else b.breakeven += 1;
    if (typeof e.discipline === "number") {
      b.disciplineSum += e.discipline;
      b.disciplineCount += 1;
    }
    const g = e.grade ? gradePoints[String(e.grade).toUpperCase()] : undefined;
    if (g) {
      b.gradeSum += g;
      b.gradeCount += 1;
    }
    map.set(key, b);
  }

  const out = new Map<string, DayBucket>();
  map.forEach((b, key) => {
    out.set(key, {
      key: b.key,
      date: b.date,
      ids: b.ids,
      pnl: b.pnl,
      wins: b.wins,
      losses: b.losses,
      breakeven: b.breakeven,
      discipline: b.disciplineCount ? b.disciplineSum / b.disciplineCount : null,
      grade: b.gradeCount ? gradeLetters[Math.round(b.gradeSum / b.gradeCount) - 1] ?? null : null,
    });
  });
  return out;
}

export type Insight = {
  id: string;
  title: string;
  detail: string;
  tone: "up" | "down" | "flat";
};

/** Rule-based pattern detection used until an AI review is available. */
export function detectInsights(entries: JournalEntry[]): Insight[] {
  const scored = entries.filter((e) => e.status !== "draft");
  if (scored.length < 3) return [];
  const out: Insight[] = [];
  const fmt = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

  const mistakes = mistakeBreakdown(scored);
  if (mistakes.length) {
    const top = mistakes[0];
    out.push({
      id: "top-mistake",
      title: `"${top.key}" is your costliest habit`,
      detail: `Logged on ${top.count} trade${top.count === 1 ? "" : "s"} for ${fmt(top.pnl)} net.`,
      tone: top.pnl < 0 ? "down" : "flat",
    });
  }

  const emotions = emotionBreakdown(scored).filter((r) => r.count >= 2);
  const worstEmotion = [...emotions].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstEmotion && worstEmotion.pnl < 0) {
    out.push({
      id: "emotion",
      title: `Trading while "${worstEmotion.key}" costs you`,
      detail: `${worstEmotion.count} trades, ${Math.round(worstEmotion.winRate)}% win rate, ${fmt(worstEmotion.pnl)} net.`,
      tone: "down",
    });
  }

  const setups = setupBreakdown(scored).filter((r) => r.count >= 2);
  const bestSetup = [...setups].sort((a, b) => b.pnl - a.pnl)[0];
  if (bestSetup && bestSetup.pnl > 0) {
    out.push({
      id: "best-setup",
      title: `${bestSetup.key} is your edge`,
      detail: `${bestSetup.count} trades at ${Math.round(bestSetup.winRate)}% win rate for ${fmt(bestSetup.pnl)}.`,
      tone: "up",
    });
  }

  const sessions = sessionBreakdown(scored).filter((r) => r.count >= 2);
  const worstSession = [...sessions].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstSession && worstSession.pnl < 0 && sessions.length > 1) {
    out.push({
      id: "session",
      title: `The ${worstSession.key} session is draining you`,
      detail: `${worstSession.count} trades for ${fmt(worstSession.pnl)}. Consider sitting it out for two weeks.`,
      tone: "down",
    });
  }

  const s = summarize(scored);
  if (s.avgLoss > 0 && s.avgWin > 0 && s.avgLoss > s.avgWin * 1.3) {
    out.push({
      id: "loss-size",
      title: "Your losers are bigger than your winners",
      detail: `Avg win ${fmt(s.avgWin)} vs avg loss ${fmt(-s.avgLoss)}. Tighten stops or let winners run.`,
      tone: "down",
    });
  }

  if (s.journaledPct < 60) {
    out.push({
      id: "journaling",
      title: "Most trades have no story",
      detail: `Only ${Math.round(s.journaledPct)}% of your trades have notes. Notes are where the edge gets found.`,
      tone: "flat",
    });
  }

  return out.slice(0, 5);
}
