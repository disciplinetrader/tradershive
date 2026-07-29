/**
 * Auto-generated journal titles.
 *
 * Removes the manual title field from the journal workflow. Falls back
 * gracefully when fields are missing so drafts still get a scannable
 * label. Format:
 *
 *   SYMBOL DIRECTION · Session · ±R · Setup
 *
 * Examples:
 *   EURUSD LONG · London · +2.1R · Breakout
 *   NQ SHORT · NY Open · -1.0R · Failed Auction
 */
import { detectSession } from "./session-detect";

type Input = {
  symbol?: string | null;
  direction?: "long" | "short" | null;
  session?: string | null;
  opened_at?: string | null;
  rr?: number | string | null;
  pnl?: number | string | null;
  setup?: string | null;
  strategy?: string | null;
};

const SESSION_LABEL: Record<string, string> = {
  sydney: "Sydney",
  tokyo: "Tokyo",
  asia: "Asia",
  london: "London",
  london_ny_overlap: "London/NY",
  new_york: "NY Open",
};

function humanize(v?: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/[_-]+/g, " ").trim();
  if (!s) return null;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the canonical journal title from whatever fields we have. */
export function generateJournalTitle(e: Input): string {
  const parts: string[] = [];

  const sym = e.symbol?.trim();
  const dir = e.direction ? e.direction.toUpperCase() : null;
  if (sym && dir) parts.push(`${sym} ${dir}`);
  else if (sym) parts.push(sym);
  else if (dir) parts.push(dir);

  const rawSession = e.session ?? detectSession(e.opened_at ?? null) ?? null;
  const sessionLabel = rawSession ? SESSION_LABEL[rawSession] ?? humanize(rawSession) : null;
  if (sessionLabel) parts.push(sessionLabel);

  const rr = e.rr != null ? Number(e.rr) : null;
  if (rr != null && Number.isFinite(rr)) {
    parts.push(`${rr >= 0 ? "+" : ""}${rr.toFixed(1)}R`);
  } else if (e.pnl != null) {
    const n = Number(e.pnl);
    if (Number.isFinite(n)) parts.push(`${n >= 0 ? "+" : ""}${n.toFixed(0)}`);
  }

  const setup = humanize(e.setup) ?? humanize(e.strategy);
  if (setup) parts.push(setup);

  if (!parts.length) return "Untitled trade";
  return parts.join(" · ");
}
