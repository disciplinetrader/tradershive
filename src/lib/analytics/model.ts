/**
 * Phase 7 — canonical analytics input contract.
 *
 * ONE normalized record shape feeds the entire analytics layer. Everything
 * downstream (metrics, equity, drawdown, cohorts, behaviour, UI) reads this
 * and nothing else, so no surface can invent its own view of a trade.
 *
 * Provenance rules
 * ----------------
 *  · execution facts come from canonical ClosedTrade / paper-trade rows and
 *    are NEVER rewritten by analytics
 *  · journal metadata only *enriches* a record; it can never change P/L, R,
 *    result classification, times or prices
 *  · a value that is genuinely unknown is `null` — never 0. `0` means "we
 *    measured zero", `null` means "we cannot know". The UI renders the two
 *    very differently (see §17 unavailable states).
 */

import type { SessionLabel } from "@/lib/market-sessions";

/**
 * What `journal_entries.session` may hold, from analytics' point of view: a
 * canonical market-session label, or `custom`, which belongs to the user and
 * is not ours to reinterpret.
 *
 * Deliberately NOT `string`. A time-band id from `periods.ts` (`utc_13_21`)
 * must not be assignable here — both were plain strings, and that is exactly
 * what let two vocabularies collide inside one `groupBy` (MS-2).
 */
export type AnalyticsSession = SessionLabel | "custom";
import type { TradeResult } from "@/lib/journal/derive";

export type Direction = "long" | "short";
export type AssetClass =
  | "forex" | "crypto" | "stocks" | "indices" | "commodities" | "futures" | "unknown";

/** Where the record was materialised from. */
export type RecordSource = "position_tool" | "paper" | "journal" | "imported";

/** How the position left the market. */
export type AnalyticsCloseReason =
  | "manual" | "stop_loss" | "take_profit" | "trailing_stop" | "break_even" | "unknown";

/** Mirrors `ExecutionSource` on the canonical order, plus an unknown fallback. */
export type ExecutionSourceKind =
  | "market" | "trigger" | "manual" | "stop_loss" | "take_profit" | "replay" | "unknown";

/** Journal metadata attached to a record. Every field is optional by design. */
export interface JournalMetadata {
  journalEntryId: string | null;
  setup: string | null;
  playbook: string | null;
  strategy: string | null;
  /**
   * Canonical market-session label, or null when the trade has no journal
   * entry. Typed rather than `string` so a time-band id (`periods.ts`) cannot
   * be assigned here — the two were both plain strings, and that is what let
   * them collide in a groupBy (MS-2).
   */
  session: AnalyticsSession | null;
  tags: string[];
  emotions: string[];
  mistakes: string[];
  lessons: string | null;
  grade: string | null;
  /** 1–10 where recorded. */
  confidence: number | null;
  /** null when the trader never answered the question. */
  followedPlan: boolean | null;
  ratings: {
    entryQuality: number | null;
    exitQuality: number | null;
    riskManagement: number | null;
    discipline: number | null;
    patience: number | null;
    execution: number | null;
  };
  status: string | null;
}

/** Flattened, analytics-facing summary of a position's execution tape. */
export interface ExecutionTapeSummary {
  /** True only when a real tape existed; false = single-shot position. */
  present: boolean;
  executionCount: number;
  entryCount: number;
  exitCount: number;
  scaleIns: number;
  partialExits: number;
  stopMoves: number;
  targetMoves: number;
  breakEvenEvents: number;
  trailingEvents: number;
  manualExits: number;
  /** Weighted-average entry / exit as folded from the tape (null when absent). */
  averageEntry: number | null;
  averageExit: number | null;
}

export const EMPTY_TAPE: ExecutionTapeSummary = {
  present: false,
  executionCount: 0,
  entryCount: 0,
  exitCount: 0,
  scaleIns: 0,
  partialExits: 0,
  stopMoves: 0,
  targetMoves: 0,
  breakEvenEvents: 0,
  trailingEvents: 0,
  manualExits: 0,
  averageEntry: null,
  averageExit: null,
};

/**
 * The canonical analytics record. Immutable from the engine's point of view.
 */
export interface AnalyticsRecord {
  /** Stable identity — dedupe key across every source. */
  tradeId: string;
  positionId: string | null;
  accountId: string | null;
  journalEntryId: string | null;
  source: RecordSource;

  symbol: string;
  market: string | null;
  assetClass: AssetClass;
  direction: Direction;
  orderType: string | null;

  /** Epoch ms. `exitTime` is the analytics anchor for every time series. */
  entryTime: number;
  exitTime: number;
  /** Seconds held. */
  duration: number;

  fillPrice: number | null;
  exitPrice: number | null;
  initialStop: number | null;
  initialTarget: number | null;
  finalStop: number | null;

  grossPnl: number;
  fees: number;
  netPnl: number;
  result: TradeResult;

  /** null when no risk basis exists — R is then not measurable. */
  riskAmount: number | null;
  realizedR: number | null;
  /** Planned R at entry (target vs stop distance), null when unknowable. */
  plannedR: number | null;
  returnPercent: number | null;
  quantity: number | null;

  closeReason: AnalyticsCloseReason;
  executionSource: ExecutionSourceKind;
  slippage: number | null;

  archived: boolean;

  journal: JournalMetadata;
  tape: ExecutionTapeSummary;
}

/** Point-in-time account state used for balance/equity curves and % risk. */
export interface AccountSnapshot {
  accountId: string;
  name: string;
  currency: string;
  startingBalance: number | null;
  balance: number | null;
  equity: number | null;
  peakEquity: number | null;
  realizedPnl: number | null;
  floatingPnl: number | null;
  timestamp: number;
  archived: boolean;
}

/** The complete, normalized input to the engine. */
export interface AnalyticsDataset {
  records: AnalyticsRecord[];
  accounts: AccountSnapshot[];
  /** IANA timezone every period boundary is computed in. */
  timezone: string;
  /** Bumped whenever canonical records change — part of the cache key. */
  tradeVersion: string;
  /** Bumped whenever journal metadata changes — part of the cache key. */
  journalVersion: string;
}

export const EMPTY_JOURNAL_METADATA: JournalMetadata = {
  journalEntryId: null,
  setup: null,
  playbook: null,
  strategy: null,
  session: null,
  tags: [],
  emotions: [],
  mistakes: [],
  lessons: null,
  grade: null,
  confidence: null,
  followedPlan: null,
  ratings: {
    entryQuality: null,
    exitQuality: null,
    riskManagement: null,
    discipline: null,
    patience: null,
    execution: null,
  },
  status: null,
};

export function emptyDataset(timezone = "UTC"): AnalyticsDataset {
  return { records: [], accounts: [], timezone, tradeVersion: "0", journalVersion: "0" };
}

/** A measured value plus the reason it may be missing (§17). */
export type Measured<T> =
  | { available: true; value: T }
  | { available: false; reason: string };

export function measured<T>(value: T | null | undefined, reason: string): Measured<T> {
  return value == null || (typeof value === "number" && !Number.isFinite(value))
    ? { available: false, reason }
    : { available: true, value: value as T };
}
