/**
 * Pure navigation helpers for Replay Studio.
 * All functions take the current cursor index and derive the next target index.
 * They never mutate — the caller applies the returned index.
 */
import type { Candle, ReplayBookmark, ReplayCheckpoint, ReplayChecklistItem, ReplayTrade } from "./types";
import { inferSession } from "@/lib/statistics/session";
import {
  isSessionOpen, nextSessionOpen, nextEquitiesOpen, SESSION_LABELS,
  type SessionKey as MarketSessionKey,
} from "@/lib/market-sessions";

export type SessionKey = "asia" | "london" | "new_york" | "other";

/** A one-click "jump to the next X open" offer for the transport bar. */
export type SessionJumpTarget = {
  key: MarketSessionKey | "ny_equities";
  label: string;
  /** Epoch ms of the next open, or null when the rule yields none. */
  at: number | null;
  /** False when the target is outside the loaded range — never silently inert. */
  reachable: boolean;
  /** Why it cannot be taken. Present only when `reachable` is false. */
  reason?: string;
};

/**
 * The session-open jumps offered at a given point in a replay.
 *
 * Pure, so the offer can be tested without a chart. Ordered by the daily
 * cycle (Sydney → Tokyo → London → New York) rather than by which is soonest:
 * a fixed order is learnable, and each target renders its own time so "which
 * is next" is still readable at a glance.
 *
 * Replay is forward-only, so a target at or before `fromMs` is not offered as
 * reachable — `nextSessionOpen` already returns the NEXT open, but a target
 * beyond the loaded data must be refused with a reason rather than becoming a
 * button that does nothing when pressed.
 */
export function sessionJumpTargets(opts: {
  fromMs: number;
  endMs: number;
  market?: string | null;
}): SessionJumpTarget[] {
  const { fromMs, endMs, market } = opts;
  const cycle: MarketSessionKey[] = ["sydney", "tokyo", "london", "new_york"];

  // `nextSessionOpen` is inclusive of `from`, which is right for "which open
  // is at or after this instant" but wrong here: standing exactly ON the
  // London open, "jump to London open" would seek to where the cursor already
  // is and appear to do nothing. Asking from one millisecond later makes the
  // offer strictly forward, so the answer is always tomorrow's open.
  const after = fromMs + 1;

  const targets: SessionJumpTarget[] = cycle.map((key) => {
    const at = nextSessionOpen(key, after)?.getTime() ?? null;
    return { key, label: SESSION_LABELS[key], ...verdict(at, endMs) };
  });

  // The NYSE bell is a different event from the New York FX open — 09:30 ET
  // against 08:00 ET — and only means anything on an equity or index chart.
  // Offering it on a crypto session would be noise dressed as a feature.
  if (market === "stocks" || market === "indices") {
    const at = nextEquitiesOpen(after)?.getTime() ?? null;
    targets.push({ key: "ny_equities", label: "NYSE bell", ...verdict(at, endMs) });
  }

  return targets;
}

function verdict(at: number | null, endMs: number) {
  if (at == null) return { at, reachable: false, reason: "no upcoming open" };
  if (at > endMs) return { at, reachable: false, reason: "beyond this session's data" };
  return { at, reachable: true };
}

/** The statistics buckets above, mapped to the centres they actually name. */
const CENTRE: Record<Exclude<SessionKey, "other">, MarketSessionKey> = {
  asia: "tokyo",
  london: "london",
  new_york: "new_york",
};

function nearestIdxAt(candles: Candle[], targetTs: number, fromIdx = 0): number {
  for (let i = Math.max(0, fromIdx); i < candles.length; i++) {
    if (candles[i].time >= targetTs) return i;
  }
  return -1;
}

/**
 * First candle at or after the next open of `key`.
 *
 * This used to match on a hardcoded UTC hour — asia 0, london 7, new_york 12.
 * Those are the summer values, so from late October a trader jumping to
 * "London open" landed an hour early, twice a year, in a way that reads as
 * random rather than as a bug. The open is now resolved through the centre's
 * own timezone and the candle index found from the resulting instant, so it
 * follows BST/GMT and EDT/EST without a table to maintain.
 */
export function jumpToSessionOpen(
  candles: Candle[],
  cursorIdx: number,
  key: Exclude<SessionKey, "other">,
  direction: "next" | "same" = "next",
): number | null {
  if (!candles.length) return null;
  const startIdx = direction === "next" ? cursorIdx + 1 : 0;
  const from = candles[Math.min(Math.max(0, startIdx), candles.length - 1)]?.time;
  if (from == null) return null;

  const open = nextSessionOpen(CENTRE[key], new Date(from));
  if (!open) return null;
  const idx = nearestIdxAt(candles, open.getTime(), startIdx);
  return idx === -1 ? null : idx;
}

/**
 * First candle after the current session's centre has closed.
 *
 * Keyed on the session actually being over rather than on a fixed 21:00 UTC —
 * which was New York's summer close, and so ran an hour early all winter and
 * had nothing to say about a London-only session at all.
 */
export function jumpToSessionClose(candles: Candle[], cursorIdx: number): number | null {
  const at = candles[cursorIdx]?.time;
  if (at == null) return null;
  const open = (["new_york", "london", "tokyo", "sydney"] as MarketSessionKey[])
    .find((k) => isSessionOpen(k, new Date(at)));
  if (!open) return null;

  for (let i = cursorIdx + 1; i < candles.length; i++) {
    if (!isSessionOpen(open, new Date(candles[i].time))) return i;
  }
  return null;
}

export function nextSession(candles: Candle[], cursorIdx: number): number | null {
  const cur = inferSession(new Date(candles[cursorIdx]?.time ?? 0).toISOString());
  for (let i = cursorIdx + 1; i < candles.length; i++) {
    const s = inferSession(new Date(candles[i].time).toISOString());
    if (s !== cur && s !== "other") return i;
  }
  return null;
}

export function prevSession(candles: Candle[], cursorIdx: number): number | null {
  const cur = inferSession(new Date(candles[cursorIdx]?.time ?? 0).toISOString());
  let seenDifferent = false;
  for (let i = cursorIdx - 1; i >= 0; i--) {
    const s = inferSession(new Date(candles[i].time).toISOString());
    if (!seenDifferent && s !== cur) {
      seenDifferent = true;
      continue;
    }
    if (seenDifferent && s === cur) return i + 1;
  }
  return seenDifferent ? 0 : null;
}

export function nextDay(candles: Candle[], cursorIdx: number): number | null {
  const curDay = new Date(candles[cursorIdx]?.time ?? 0).toISOString().slice(0, 10);
  for (let i = cursorIdx + 1; i < candles.length; i++) {
    if (new Date(candles[i].time).toISOString().slice(0, 10) !== curDay) return i;
  }
  return null;
}

export function prevDay(candles: Candle[], cursorIdx: number): number | null {
  const curDay = new Date(candles[cursorIdx]?.time ?? 0).toISOString().slice(0, 10);
  let prevDayStr: string | null = null;
  for (let i = cursorIdx - 1; i >= 0; i--) {
    const d = new Date(candles[i].time).toISOString().slice(0, 10);
    if (d !== curDay) {
      if (prevDayStr === null) prevDayStr = d;
      if (d !== prevDayStr) return i + 1;
    }
  }
  return prevDayStr ? 0 : null;
}

export function nextBookmark(candles: Candle[], cursorIdx: number, bookmarks: ReplayBookmark[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...bookmarks].sort((a, b) => new Date(a.bookmark_ts).getTime() - new Date(b.bookmark_ts).getTime());
  const target = sorted.find((b) => new Date(b.bookmark_ts).getTime() > curTs);
  return target ? nearestIdxAt(candles, new Date(target.bookmark_ts).getTime()) : null;
}

export function prevBookmark(candles: Candle[], cursorIdx: number, bookmarks: ReplayBookmark[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...bookmarks].sort((a, b) => new Date(b.bookmark_ts).getTime() - new Date(a.bookmark_ts).getTime());
  const target = sorted.find((b) => new Date(b.bookmark_ts).getTime() < curTs);
  return target ? nearestIdxAt(candles, new Date(target.bookmark_ts).getTime()) : null;
}

export function nextCheckpoint(candles: Candle[], cursorIdx: number, cps: ReplayCheckpoint[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...cps].sort((a, b) => new Date(a.checkpoint_ts).getTime() - new Date(b.checkpoint_ts).getTime());
  const target = sorted.find((b) => new Date(b.checkpoint_ts).getTime() > curTs);
  return target ? nearestIdxAt(candles, new Date(target.checkpoint_ts).getTime()) : null;
}

export function prevCheckpoint(candles: Candle[], cursorIdx: number, cps: ReplayCheckpoint[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...cps].sort((a, b) => new Date(b.checkpoint_ts).getTime() - new Date(a.checkpoint_ts).getTime());
  const target = sorted.find((b) => new Date(b.checkpoint_ts).getTime() < curTs);
  return target ? nearestIdxAt(candles, new Date(target.checkpoint_ts).getTime()) : null;
}

export function nextTrade(candles: Candle[], cursorIdx: number, trades: ReplayTrade[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...trades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
  const target = sorted.find((t) => new Date(t.opened_at).getTime() > curTs);
  return target ? nearestIdxAt(candles, new Date(target.opened_at).getTime()) : null;
}

export function prevTrade(candles: Candle[], cursorIdx: number, trades: ReplayTrade[]): number | null {
  const curTs = candles[cursorIdx]?.time ?? 0;
  const sorted = [...trades].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
  const target = sorted.find((t) => new Date(t.opened_at).getTime() < curTs);
  return target ? nearestIdxAt(candles, new Date(target.opened_at).getTime()) : null;
}

export function tradeEntry(candles: Candle[], trades: ReplayTrade[]): number | null {
  if (!trades.length) return null;
  const first = [...trades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())[0];
  return nearestIdxAt(candles, new Date(first.opened_at).getTime());
}

export function tradeExit(candles: Candle[], trades: ReplayTrade[]): number | null {
  const closed = trades.filter((t) => t.closed_at);
  if (!closed.length) return null;
  const last = [...closed].sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime())[0];
  return nearestIdxAt(candles, new Date(last.closed_at!).getTime());
}

export function nextObjective(_candles: Candle[], cursorIdx: number, checklist: ReplayChecklistItem[]): number | null {
  // Objectives don't have timestamps — advance a fixed window (~20 candles) as an educational nudge.
  const unchecked = checklist.filter((c) => !c.checked).length;
  if (!unchecked) return null;
  return cursorIdx + 20;
}

export function prevObjective(_candles: Candle[], cursorIdx: number, _checklist: ReplayChecklistItem[]): number | null {
  return Math.max(0, cursorIdx - 20);
}
