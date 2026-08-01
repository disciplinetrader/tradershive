/**
 * Phase 8D · reproducible, versioned Replay scoring.
 *
 * A score is only useful if it can be re-derived. Every stored score therefore
 * carries:
 *
 *   · `score_version`  — the formula generation (bump when weights change)
 *   · `input_source`   — where the execution facts came from
 *   · `input_revision` — a content hash of the exact inputs that were scored
 *   · `unknown_inputs` — what could not be measured, named honestly
 *
 * Same inputs + same version ⇒ byte-identical score. The formula itself is
 * NOT re-implemented here; it is `computeReplayScore`, the single shared one.
 */

import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import { scoreFactsFromClosedTrades, type ScoreTradeFact } from "@/lib/replay/reflection/adapter";

/** Formula generation. Bump ONLY when `computeReplayScore` weights change. */
export const SCORE_VERSION = 2;

export type ScoreInputSource = "canonical" | "client";

export interface ScoreInputs {
  version: number;
  source: ScoreInputSource;
  revision: string;
  trades: ScoreTradeFact[];
  unknowns: string[];
}

/** FNV-1a — the same cheap, stable hash the dataset identity uses. */
export function revisionHash(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Build the exact, hashable input set for one scoring run.
 *
 * `unknowns` is part of the record, not a warning that gets dropped: a score
 * produced without a risk basis must stay distinguishable from one produced
 * with it.
 */
export function buildScoreInputs(input: {
  trades: readonly ClosedTrade[];
  startingBalance?: number | null;
  checklistTotal: number;
  checklistDone: number;
  bookmarkCategories: number;
  notesCount: number;
  source?: ScoreInputSource;
}): ScoreInputs {
  const balance =
    typeof input.startingBalance === "number" && input.startingBalance > 0 ? input.startingBalance : null;

  const trades = scoreFactsFromClosedTrades([...input.trades], { startingBalance: balance });

  const unknowns: string[] = [];
  if (balance == null && input.trades.length > 0) unknowns.push("risk_pct");
  if (input.checklistTotal === 0) unknowns.push("checklist");
  if (trades.every((t) => t.rr_realized == null) && trades.length > 0) unknowns.push("rr_realized");

  const revision = revisionHash({
    v: SCORE_VERSION,
    trades,
    checklistTotal: input.checklistTotal,
    checklistDone: input.checklistDone,
    bookmarkCategories: input.bookmarkCategories,
    notesCount: input.notesCount,
  });

  return {
    version: SCORE_VERSION,
    source: input.source ?? "canonical",
    revision,
    trades,
    unknowns,
  };
}
