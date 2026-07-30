/**
 * TRADE EDITOR — contextual validation.
 *
 * Pure function over an entry. Never blocks saving: a draft is allowed to be
 * incomplete. Issues are graded so the UI can separate a real error from a
 * hint about missing journal work.
 */
import type { JournalEntry } from "@/lib/journal/api";
import { readExtras, readPsychology, type SectionId } from "./model";

export type IssueLevel = "error" | "warning" | "missing" | "calc";

export type ValidationIssue = {
  id: string;
  level: IssueLevel;
  section: SectionId;
  field?: string;
  message: string;
};

export const ISSUE_LABEL: Record<IssueLevel, string> = {
  error: "Error",
  warning: "Warning",
  missing: "Missing",
  calc: "Check",
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function validateEntry(entry: JournalEntry): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const push = (i: ValidationIssue) => out.push(i);

  const x = readExtras(entry);
  const entryPrice = num(entry.entry_price);
  const exitPrice = num(entry.exit_price);
  const sl = num(entry.stop_loss);
  const tp = num(entry.take_profit);
  const long = entry.direction !== "short";

  /* Errors — logically impossible data */

  if (entry.opened_at && entry.closed_at) {
    if (new Date(entry.closed_at).getTime() < new Date(entry.opened_at).getTime()) {
      push({ id: "time-order", level: "error", section: "execution", field: "closed_at", message: "Exit time is before entry time." });
    }
  }

  const lot = num(entry.lot_size);
  if (lot !== null && lot <= 0) {
    push({ id: "qty", level: "error", section: "execution", field: "lot_size", message: "Quantity must be greater than zero." });
  }

  const riskPct = num(entry.risk_pct);
  if (riskPct !== null && riskPct < 0) {
    push({ id: "risk-neg", level: "error", section: "plan", field: "risk_pct", message: "Risk percentage cannot be negative." });
  }
  if (riskPct !== null && riskPct > 100) {
    push({ id: "risk-max", level: "error", section: "plan", field: "risk_pct", message: "Risk percentage cannot exceed 100%." });
  }

  if (entryPrice !== null && sl !== null) {
    if (long && sl >= entryPrice) {
      push({ id: "sl-side", level: "error", section: "plan", field: "stop_loss", message: "On a long, the stop must sit below entry." });
    }
    if (!long && sl <= entryPrice) {
      push({ id: "sl-side", level: "error", section: "plan", field: "stop_loss", message: "On a short, the stop must sit above entry." });
    }
  }
  if (entryPrice !== null && tp !== null) {
    if (long && tp <= entryPrice) {
      push({ id: "tp-side", level: "warning", section: "plan", field: "take_profit", message: "On a long, the target normally sits above entry." });
    }
    if (!long && tp >= entryPrice) {
      push({ id: "tp-side", level: "warning", section: "plan", field: "take_profit", message: "On a short, the target normally sits below entry." });
    }
  }

  const psych = readPsychology(entry);
  for (const [k, v] of Object.entries(psych.intensity ?? {})) {
    if (typeof v === "number" && (v < 1 || v > 3)) {
      push({ id: `psy-${k}`, level: "error", section: "psychology", message: `Intensity for ${k} is out of range.` });
    }
  }
  for (const f of ["confidence", "discipline", "execution", "patience", "risk_mgmt", "entry_quality", "exit_quality"] as const) {
    const v = num(entry[f]);
    if (v !== null && (v < 0 || v > 5)) {
      push({ id: `rate-${f}`, level: "error", section: "review", field: f, message: `${f.replace(/_/g, " ")} must be between 0 and 5.` });
    }
  }

  /* Calculated inconsistencies */

  if (entryPrice !== null && sl !== null && tp !== null) {
    const risk = Math.abs(entryPrice - sl);
    const reward = Math.abs(tp - entryPrice);
    if (risk > 0) {
      const expected = reward / risk;
      const stated = num(entry.rr);
      if (stated !== null && Math.abs(stated - expected) > Math.max(0.35, expected * 0.25)) {
        push({
          id: "rr-mismatch",
          level: "calc",
          section: "plan",
          field: "rr",
          message: `Stored R:R (${stated.toFixed(2)}) does not match plan levels (${expected.toFixed(2)}).`,
        });
      }
    }
  }

  if (exitPrice !== null && entryPrice !== null && entry.pnl != null) {
    const dir = long ? 1 : -1;
    const sign = Math.sign((exitPrice - entryPrice) * dir);
    const pnlSign = Math.sign(Number(entry.pnl));
    if (sign !== 0 && pnlSign !== 0 && sign !== pnlSign) {
      push({ id: "pnl-sign", level: "calc", section: "execution", field: "pnl", message: "P/L sign disagrees with entry vs exit price." });
    }
  }

  /* Missing journal work — never blocking */

  if (!entry.symbol) push({ id: "m-symbol", level: "missing", section: "trade", field: "symbol", message: "No symbol set." });
  if (!entry.direction) push({ id: "m-dir", level: "missing", section: "trade", field: "direction", message: "No direction set." });
  if (!entry.setup) push({ id: "m-setup", level: "missing", section: "trade", field: "setup", message: "No setup tagged — needed for playbook stats." });
  if (sl === null) push({ id: "m-sl", level: "missing", section: "plan", field: "stop_loss", message: "No stop loss recorded." });
  if (!entry.grade) push({ id: "m-grade", level: "missing", section: "review", field: "grade", message: "Not graded yet." });
  if (!x.exit_reason && entry.status !== "draft" && entry.closed_at) {
    push({ id: "m-exit", level: "missing", section: "review", message: "No exit reason recorded." });
  }
  if (!(entry.screenshots ?? []).length) {
    push({ id: "m-shot", level: "missing", section: "media", message: "No screenshot evidence attached." });
  }

  return out;
}

export function issueCounts(issues: ValidationIssue[]) {
  return {
    error: issues.filter((i) => i.level === "error").length,
    warning: issues.filter((i) => i.level === "warning").length,
    missing: issues.filter((i) => i.level === "missing").length,
    calc: issues.filter((i) => i.level === "calc").length,
  };
}

export function issuesForSection(issues: ValidationIssue[], section: SectionId) {
  return issues.filter((i) => i.section === section);
}
