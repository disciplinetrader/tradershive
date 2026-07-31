/**
 * Normalization: canonical records → the analytics input contract.
 *
 * This is the ONLY place a foreign shape becomes an `AnalyticsRecord`. Every
 * adapter reuses the derivation that already owns the formula:
 *   · ClosedTrade → already derived via `@/lib/journal/derive` at close time
 *   · paper/journal rows → `resultOf()` for classification, recorded R for R
 *
 * Nothing here recomputes P/L from prices when a canonical P/L exists.
 */

import { resultOf } from "@/lib/journal/derive";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { PositionExecution } from "@/lib/chart/orders/executions";
import { aggregateExecutions, isEntryKind, isExitKind } from "@/lib/chart/orders/executions";
import type { AnalyticsTrade } from "@/lib/statistics/types";
import type { JournalEntry } from "@/lib/journal/api";

import {
  EMPTY_JOURNAL_METADATA, EMPTY_TAPE,
  type AccountSnapshot, type AnalyticsCloseReason, type AnalyticsRecord,
  type AssetClass, type ExecutionSourceKind, type ExecutionTapeSummary,
  type JournalMetadata,
} from "./model";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const FOREX = /^[A-Z]{3}\/?[A-Z]{3}$/;
const CRYPTO = /(BTC|ETH|SOL|XRP|ADA|DOGE|USDT|USDC)/;
const METALS = /^(XAU|XAG|XPT|XPD)/;

/** Best-effort asset classification; `unknown` rather than a wrong guess. */
export function classifyAsset(symbol: string, market?: string | null): AssetClass {
  const m = (market ?? "").toLowerCase();
  if (m.includes("crypto")) return "crypto";
  if (m.includes("forex") || m === "fx") return "forex";
  if (m.includes("stock") || m.includes("equit")) return "stocks";
  if (m.includes("ind")) return "indices";
  if (m.includes("commod") || m.includes("metal")) return "commodities";
  if (m.includes("future")) return "futures";

  const s = (symbol ?? "").toUpperCase();
  if (METALS.test(s)) return "commodities";
  if (CRYPTO.test(s)) return "crypto";
  if (FOREX.test(s)) return "forex";
  if (/^[A-Z]{1,5}$/.test(s)) return "stocks";
  return "unknown";
}

function closeReasonOf(v: string | null | undefined): AnalyticsCloseReason {
  switch (v) {
    case "stop_loss": case "take_profit": case "manual":
    case "trailing_stop": case "break_even":
      return v;
    default:
      return "unknown";
  }
}

function executionSourceOf(v: string | null | undefined): ExecutionSourceKind {
  switch (v) {
    case "market": case "trigger": case "manual":
    case "stop_loss": case "take_profit": case "replay":
      return v;
    default: return "unknown";
  }
}

/** Fold a raw execution tape into the analytics-facing summary. */
export function summarizeTape(executions: readonly PositionExecution[] | undefined): ExecutionTapeSummary {
  if (!executions || executions.length === 0) return EMPTY_TAPE;
  const agg = aggregateExecutions(executions);
  let scaleIns = 0, partialExits = 0, stopMoves = 0, targetMoves = 0;
  let breakEven = 0, trailing = 0, manualExits = 0;

  for (const e of executions) {
    if (e.kind === "scale_in") scaleIns += 1;
    if (e.kind === "partial_close" || e.kind === "scale_out") partialExits += 1;
    if (e.kind === "stop_move") {
      stopMoves += 1;
      const note = (e.note ?? "").toLowerCase();
      if (note.includes("break")) breakEven += 1;
      if (note.includes("trail")) trailing += 1;
    }
    if (e.kind === "target_move") targetMoves += 1;
    if (e.kind === "close" || e.kind === "partial_close") manualExits += 1;
  }

  return {
    present: true,
    executionCount: executions.length,
    entryCount: executions.filter((e) => isEntryKind(e.kind) && e.quantity > 0).length,
    exitCount: executions.filter((e) => isExitKind(e.kind) && e.quantity > 0).length,
    scaleIns,
    partialExits,
    stopMoves,
    targetMoves,
    breakEvenEvents: breakEven,
    trailingEvents: trailing,
    manualExits,
    averageEntry: Number.isFinite(agg.averageEntry) ? agg.averageEntry : null,
    averageExit: agg.averageExit,
  };
}

/** Planned R implied by the protective levels recorded at entry. */
export function plannedRFrom(
  fill: number | null, stop: number | null, target: number | null,
): number | null {
  if (fill == null || stop == null || target == null) return null;
  const risk = Math.abs(fill - stop);
  if (!(risk > 0)) return null;
  return Math.abs(target - fill) / risk;
}

// ── Journal metadata ────────────────────────────────────────────────────────

function readTags(entry: JournalEntry): string[] {
  const raw = (entry as unknown as { strategy_tags?: unknown }).strategy_tags;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
}

function readFollowedPlan(entry: JournalEntry): boolean | null {
  const review = (entry as unknown as { playbook_review?: unknown }).playbook_review;
  if (review && typeof review === "object") {
    const v = (review as Record<string, unknown>).followed_plan ?? (review as Record<string, unknown>).followedPlan;
    if (typeof v === "boolean") return v;
  }
  return null;
}

export function journalMetadataOf(entry: JournalEntry | null | undefined): JournalMetadata {
  if (!entry) return EMPTY_JOURNAL_METADATA;
  return {
    journalEntryId: entry.id,
    setup: entry.setup ?? null,
    playbook: entry.strategy ?? entry.setup ?? null,
    strategy: entry.strategy ?? null,
    session: entry.session ?? null,
    tags: readTags(entry),
    emotions: Array.isArray(entry.emotions) ? entry.emotions : [],
    mistakes: Array.isArray(entry.mistakes) ? entry.mistakes : [],
    lessons: entry.notes_text ?? null,
    grade: entry.grade ?? null,
    confidence: num(entry.confidence),
    followedPlan: readFollowedPlan(entry),
    ratings: {
      entryQuality: num(entry.entry_quality),
      exitQuality: num(entry.exit_quality),
      riskManagement: num(entry.risk_mgmt),
      discipline: num(entry.discipline),
      patience: num(entry.patience),
      execution: num(entry.execution),
    },
    status: entry.status ?? null,
  };
}

// ── Adapters ────────────────────────────────────────────────────────────────

/** ClosedTrade (Position Tool) → analytics record. Execution facts pass through untouched. */
export function fromClosedTrade(
  trade: ClosedTrade,
  opts: {
    accountId?: string | null;
    journal?: JournalEntry | null;
    executions?: readonly PositionExecution[];
  } = {},
): AnalyticsRecord {
  const journal = journalMetadataOf(opts.journal);
  return {
    tradeId: trade.id,
    positionId: trade.positionId,
    accountId: opts.accountId ?? null,
    journalEntryId: trade.journalEntryId,
    source: "position_tool",

    symbol: trade.symbol,
    market: trade.market,
    assetClass: classifyAsset(trade.symbol, trade.market),
    direction: trade.direction === "buy" ? "long" : "short",
    orderType: trade.orderType,

    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    duration: Math.max(0, Math.round((trade.exitTime - trade.entryTime) / 1000)),

    fillPrice: trade.fillPrice,
    exitPrice: trade.exitPrice,
    initialStop: trade.initialStop,
    initialTarget: trade.initialTarget,
    finalStop: trade.finalStop,

    grossPnl: trade.grossPnl,
    fees: trade.fees,
    netPnl: trade.netPnl,
    result: resultOf(trade.netPnl) ?? "breakeven",

    riskAmount: trade.riskAmount > 0 ? trade.riskAmount : null,
    realizedR: trade.riskAmount > 0 ? trade.realizedR : null,
    plannedR: plannedRFrom(trade.fillPrice, trade.initialStop, trade.initialTarget),
    returnPercent: Number.isFinite(trade.returnPercent) ? trade.returnPercent : null,
    quantity: trade.quantity,

    closeReason: closeReasonOf(trade.closeReason),
    executionSource: executionSourceOf(trade.executionSource),
    slippage: Number.isFinite(trade.slippage) ? trade.slippage : null,

    archived: !!trade.archivedAt,

    journal: { ...journal, journalEntryId: journal.journalEntryId ?? trade.journalEntryId },
    tape: summarizeTape(opts.executions),
  };
}

/**
 * Legacy paper/journal dataset row → analytics record.
 *
 * `pnl` on these rows is already the net figure (Journal derivation contract),
 * so gross is reconstructed as net + fees rather than recomputed from prices.
 */
export function fromAnalyticsTrade(t: AnalyticsTrade): AnalyticsRecord {
  const fees = (num(t.commission) ?? 0) + (num(t.swap) ?? 0);
  const netPnl = num(t.pnl) ?? 0;
  const entryTime = Date.parse(t.opened_at);
  const exitTime = t.closed_at ? Date.parse(t.closed_at) : entryTime;
  const entry = num(t.entry_price);
  const stop = num(t.stop_loss);
  const riskAmount =
    entry != null && stop != null && num(t.lot_size) != null && (num(t.lot_size) as number) > 0
      ? Math.abs(entry - stop) * (num(t.lot_size) as number)
      : null;

  const r = riskAmount != null && riskAmount > 0 ? netPnl / riskAmount : num(t.rr);

  return {
    tradeId: `${t.source}:${t.id}`,
    positionId: null,
    accountId: t.account_id,
    journalEntryId: t.source === "journal" ? t.id : null,
    source: t.source === "imported" ? "imported" : t.source === "journal" ? "journal" : "paper",

    symbol: t.symbol,
    market: t.market ?? null,
    assetClass: classifyAsset(t.symbol, t.market),
    direction: t.direction,
    orderType: null,

    entryTime: Number.isFinite(entryTime) ? entryTime : 0,
    exitTime: Number.isFinite(exitTime) ? exitTime : (Number.isFinite(entryTime) ? entryTime : 0),
    duration: t.duration_seconds ?? Math.max(0, Math.round((exitTime - entryTime) / 1000)),

    fillPrice: entry,
    exitPrice: num(t.exit_price),
    initialStop: stop,
    initialTarget: num(t.take_profit),
    finalStop: stop,

    grossPnl: netPnl + fees,
    fees,
    netPnl,
    result: resultOf(netPnl) ?? "breakeven",

    riskAmount,
    realizedR: r,
    plannedR: plannedRFrom(entry, stop, num(t.take_profit)),
    returnPercent: entry != null && entry !== 0 && num(t.exit_price) != null
      ? (((num(t.exit_price) as number) - entry) / entry) * 100 * (t.direction === "long" ? 1 : -1)
      : null,
    quantity: num(t.lot_size),

    closeReason: "unknown",
    executionSource: "unknown",
    slippage: null,

    archived: t.status === "archived",

    journal: {
      ...EMPTY_JOURNAL_METADATA,
      journalEntryId: t.source === "journal" ? t.id : null,
      setup: t.setup,
      playbook: t.strategy ?? t.setup,
      strategy: t.strategy,
      session: t.session,
      emotions: t.emotions ?? [],
      mistakes: t.mistakes ?? [],
      grade: t.grade,
      status: t.status ?? null,
    },
    tape: EMPTY_TAPE,
  };
}

export function accountSnapshotOf(a: {
  id: string; name: string; currency: string;
  starting_balance: number; balance: number; equity: number; is_archived: boolean;
}, timestamp = Date.now()): AccountSnapshot {
  return {
    accountId: a.id,
    name: a.name,
    currency: a.currency,
    startingBalance: num(a.starting_balance),
    balance: num(a.balance),
    equity: num(a.equity),
    peakEquity: null,
    realizedPnl: num(a.balance) != null && num(a.starting_balance) != null
      ? (num(a.balance) as number) - (num(a.starting_balance) as number)
      : null,
    floatingPnl: num(a.equity) != null && num(a.balance) != null
      ? (num(a.equity) as number) - (num(a.balance) as number)
      : null,
    timestamp,
    archived: !!a.is_archived,
  };
}

/**
 * Dedupe across sources (§18.38). A Position Tool trade linked to a journal
 * entry must not also be counted through that entry's row.
 */
export function dedupeRecords(records: readonly AnalyticsRecord[]): AnalyticsRecord[] {
  const byId = new Map<string, AnalyticsRecord>();
  const claimedJournal = new Set<string>();
  const claimedPosition = new Set<string>();

  // Position Tool records win — they carry the execution tape.
  const ordered = [...records].sort((a, b) => {
    const rank = (r: AnalyticsRecord) => (r.source === "position_tool" ? 0 : 1);
    return rank(a) - rank(b);
  });

  for (const r of ordered) {
    if (byId.has(r.tradeId)) continue;
    if (r.journalEntryId && claimedJournal.has(r.journalEntryId)) continue;
    if (r.positionId && claimedPosition.has(r.positionId)) continue;
    byId.set(r.tradeId, r);
    if (r.journalEntryId) claimedJournal.add(r.journalEntryId);
    if (r.positionId) claimedPosition.add(r.positionId);
  }
  return [...byId.values()].sort((a, b) => a.exitTime - b.exitTime || a.tradeId.localeCompare(b.tradeId));
}
