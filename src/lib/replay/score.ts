import type { ReplayTrade, ReplayChecklistItem, ReplayBookmark } from "./types";

export type ScoreBreakdown = {
  score: number;
  discipline: number;
  risk: number;
  execution: number;
  patience: number;
  consistency: number;
  journal_completion: number;
  notes: string[];
};

export function computeReplayScore(input: {
  trades: ReplayTrade[];
  checklist: ReplayChecklistItem[];
  bookmarks: ReplayBookmark[];
  notesCount: number;
  hasJournal?: boolean;
}): ScoreBreakdown {
  const { trades, checklist, bookmarks, notesCount, hasJournal } = input;
  const closed = trades.filter((t) => t.status === "closed");
  const total = closed.length;
  const notes: string[] = [];

  // Discipline: % checklist items ticked
  const chkTotal = Math.max(1, checklist.length);
  const chkDone = checklist.filter((c) => c.checked).length;
  const discipline = Math.round((chkDone / chkTotal) * 100);
  if (discipline < 50) notes.push("Complete more of your pre-trade checklist.");

  // Risk: % trades that had a stop loss and risk_pct <= 2
  const withStop = closed.filter((t) => t.stop_loss != null).length;
  const okRisk = closed.filter((t) => (t.risk_pct ?? 0) <= 2).length;
  const risk = total ? Math.round(((withStop + okRisk) / (total * 2)) * 100) : 100;
  if (risk < 60) notes.push("Use a defined stop-loss and cap risk at 2%.");

  // Execution: win rate weighted by avg RR
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = total ? wins / total : 0;
  const avgRr = total ? closed.reduce((s, t) => s + (t.rr_realized ?? 0), 0) / total : 0;
  const execution = Math.round(Math.min(100, winRate * 60 + Math.max(0, avgRr) * 15));
  if (execution < 40) notes.push("Focus on higher R:R setups.");

  // Patience: fewer trades per session is better, up to a point
  const patience = total === 0 ? 60 : total <= 3 ? 100 : total <= 6 ? 80 : total <= 10 ? 60 : 40;
  if (patience < 60) notes.push("Fewer, higher-quality trades beat overtrading.");

  // Consistency: bookmarks show reflection; more categories = better
  const cats = new Set(bookmarks.map((b) => b.category));
  const consistency = Math.min(100, 40 + cats.size * 12 + notesCount * 4);

  // Journal completion
  const journal_completion = hasJournal ? 100 : notesCount > 0 ? 60 : 0;
  if (journal_completion < 60) notes.push("Journal your replay decisions.");

  const score = Math.round(
    discipline * 0.25 +
      risk * 0.2 +
      execution * 0.2 +
      patience * 0.15 +
      consistency * 0.1 +
      journal_completion * 0.1,
  );

  return { score, discipline, risk, execution, patience, consistency, journal_completion, notes };
}
