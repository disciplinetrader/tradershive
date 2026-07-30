/**
 * Canonical journal result derivation.
 *
 * Single source of truth for: fees, gross/net P/L, win-loss-breakeven result,
 * risk basis and R-multiple. Every surface (trade row, Trade Story, calendar,
 * overview, analytics, Hive Score, replay comparison) must read the result
 * from here instead of re-deciding locally.
 *
 * Rules:
 * - `pnl` on the row is ALWAYS the net (after-fees) figure.
 * - Gross = net + fees. Fees = commission + swap, null when neither exists.
 * - A missing input yields `null` ("Not measurable"), never `0`.
 * - R-multiple always reports which risk basis produced it.
 */

import type { JournalEntry, EntryUpdate } from "@/lib/journal/api";
import { readExtras, fieldSource } from "@/lib/journal/editor/model";

export type TradeResult = "win" | "loss" | "breakeven";

/** How the risk denominator behind R was obtained. */
export type RiskBasis = "planned" | "levels" | "risk_pct";

export const RISK_BASIS_LABEL: Record<RiskBasis, string> = {
  planned: "Planned risk (recorded before entry)",
  levels: "Execution risk (entry → stop × size)",
  risk_pct: "Risk % of account",
};

export type DerivedTrade = {
  fees: number | null;
  netPnl: number | null;
  grossPnl: number | null;
  /** null while the trade has no realized P/L (open / not measurable). */
  result: TradeResult | null;
  riskAmount: number | null;
  riskBasis: RiskBasis | null;
  riskPct: number | null;
  r: number | null;
  /** Basis behind `r`; null when R is not measurable. */
  rBasis: RiskBasis | null;
  /** True when R came from a stored manual correction rather than the levels. */
  rIsManual: boolean;
};

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/** Canonical win/loss/breakeven from a net P/L value. */
export function resultOf(netPnl: number | null | undefined): TradeResult | null {
  const n = num(netPnl);
  if (n == null) return null;
  if (n > 0) return "win";
  if (n < 0) return "loss";
  return "breakeven";
}

/** Fees = commission + swap. Null only when neither is recorded. */
export function feesOf(entry: Pick<JournalEntry, "commission" | "swap">): number | null {
  const c = num(entry.commission);
  const s = num(entry.swap);
  if (c == null && s == null) return null;
  return (c ?? 0) + (s ?? 0);
}

/**
 * Risk in account currency.
 * Planned risk recorded before entry always wins — a stop moved mid-trade must
 * never silently overwrite the original risk the trade was sized against.
 */
export function riskOf(entry: JournalEntry): { amount: number | null; basis: RiskBasis | null } {
  const planned = num(readExtras(entry).risk_amount);
  if (planned != null && planned > 0) return { amount: planned, basis: "planned" };

  const entryPrice = num(entry.entry_price);
  const stop = num(entry.stop_loss);
  const size = num(entry.lot_size);
  if (entryPrice != null && stop != null && size != null && size > 0) {
    const distance = Math.abs(entryPrice - stop);
    if (distance > 0) return { amount: distance * size, basis: "levels" };
  }
  return { amount: null, basis: null };
}

/** The full canonical derivation for one entry. */
export function deriveTrade(entry: JournalEntry): DerivedTrade {
  const netPnl = num(entry.pnl);
  const fees = feesOf(entry);
  const grossPnl = netPnl == null ? null : netPnl + (fees ?? 0);
  const { amount: riskAmount, basis: riskBasis } = riskOf(entry);

  const computedR = netPnl != null && riskAmount != null && riskAmount > 0 ? netPnl / riskAmount : null;

  // A trader-corrected R is respected, but only when it was explicitly stored
  // as a correction — a stale calculated value never survives an edit.
  const rIsManual = fieldSource(entry, "rr") === "corrected";
  const storedR = num(entry.rr);
  const r = rIsManual ? storedR : (computedR ?? (riskAmount == null ? storedR : computedR));

  return {
    fees,
    netPnl,
    grossPnl,
    result: resultOf(netPnl),
    riskAmount,
    riskBasis,
    riskPct: num(entry.risk_pct),
    r,
    rBasis: rIsManual ? riskBasis : computedR != null ? riskBasis : null,
    rIsManual,
  };
}

/** Fields whose change invalidates the derived R-multiple. */
const R_INPUTS = ["pnl", "commission", "swap", "entry_price", "stop_loss", "lot_size", "narrative"] as const;

/**
 * Extra columns that must be written alongside a user patch so no surface ever
 * reads a stale derived value. Returns `{}` when nothing needs recomputing.
 */
export function derivedPatch(entry: JournalEntry, patch: EntryUpdate): EntryUpdate {
  const touched = Object.keys(patch);
  if (!touched.some((k) => (R_INPUTS as readonly string[]).includes(k))) return {};
  // An explicit R edit in the same patch is the user's intent — leave it alone.
  if ("rr" in patch) return {};

  const next = { ...entry, ...patch } as JournalEntry;
  if (fieldSource(next, "rr") === "corrected") return {};

  const d = deriveTrade(next);
  const nextR = d.rIsManual ? null : d.r;
  const current = num(entry.rr);
  if (nextR == null && current == null) return {};
  if (nextR != null && current != null && Math.abs(nextR - current) < 1e-9) return {};
  return { rr: nextR };
}
