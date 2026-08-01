/**
 * Phase 8D · server-side review derivation helpers.
 *
 * Kept out of the `.functions.ts` wrapper on purpose: server-function modules
 * must contain nothing but imports, types and the exported declarations, or
 * the splitter drops their runtime siblings.
 *
 * Everything here is a read + a pure derivation. Nothing rewrites an
 * execution fact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { closedTradeFromRow } from "@/lib/chart/orders/trade-sync";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import { buildSessionSummary, type ReplaySessionSummary } from "./summary";

type DB = SupabaseClient<any, any, any>;

/** Rows cross the SSR boundary, so they must stay plain JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonRow = Record<string, any>;

export async function loadSessionTrades(supabase: DB, sessionId: string): Promise<ClosedTrade[]> {
  const { data, error } = await supabase
    .from("chart_closed_trades")
    .select("*")
    .eq("replay_session_id", sessionId)
    .order("closed_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r: JsonRow) => closedTradeFromRow(r));
}

export async function loadReflectionCounts(supabase: DB, sessionId: string) {
  const [notes, bookmarks, checkpoints, screenshots, checklist] = await Promise.all([
    supabase.from("replay_notes").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("replay_bookmarks").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("replay_checkpoints").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("replay_screenshots").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("replay_checklists").select("checked").eq("session_id", sessionId),
  ]);
  const items = (checklist.data ?? []) as { checked: boolean }[];
  return {
    notes: notes.count ?? 0,
    bookmarks: bookmarks.count ?? 0,
    checkpoints: checkpoints.count ?? 0,
    screenshots: screenshots.count ?? 0,
    checklistTotal: items.length,
    checklistDone: items.filter((i) => i.checked).length,
  };
}

export interface SessionReview {
  session: JsonRow | null;
  summary: ReplaySessionSummary;
  trades: ClosedTrade[];
  score: JsonRow | null;
  comparisons: JsonRow[];
  screenshots: JsonRow[];
  homework: JsonRow[];
}

export async function buildSessionReview(supabase: DB, sessionId: string): Promise<SessionReview> {
  const [sessionRes, trades, counts, scoreRes, comparisonsRes, shotsRes, homeworkRes] = await Promise.all([
    supabase.from("replay_sessions").select("*").eq("id", sessionId).maybeSingle(),
    loadSessionTrades(supabase, sessionId),
    loadReflectionCounts(supabase, sessionId),
    supabase
      .from("replay_scores").select("*").eq("session_id", sessionId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("replay_comparisons").select("*").eq("session_id", sessionId).order("attempt_number"),
    supabase.from("replay_screenshots").select("*").eq("session_id", sessionId).order("captured_ts", { ascending: false }),
    supabase.from("replay_homework").select("*").eq("source_session_id", sessionId).order("created_at", { ascending: false }),
  ]);

  const session = (sessionRes.data ?? null) as JsonRow | null;
  const initialBalance = session && typeof session.initial_balance !== "undefined"
    ? Number(session.initial_balance)
    : null;

  const summary = buildSessionSummary({
    sessionId,
    symbol: (session?.symbol as string) ?? null,
    timeframe: (session?.timeframe as string) ?? null,
    status: (session?.status as string) ?? null,
    durationSeconds: session?.duration_seconds != null ? Number(session.duration_seconds) : null,
    completionPct: session?.completion_pct != null ? Number(session.completion_pct) : null,
    startingBalance: Number.isFinite(initialBalance) ? initialBalance : null,
    trades,
    reflection: counts,
  });

  return {
    session,
    summary,
    trades,
    score: (scoreRes.data ?? null) as JsonRow | null,
    comparisons: (comparisonsRes.data ?? []) as JsonRow[],
    screenshots: (shotsRes.data ?? []) as JsonRow[],
    homework: (homeworkRes.data ?? []) as JsonRow[],
  };
}

export interface HistoryRow {
  id: string;
  title: string;
  symbol: string;
  timeframe: string;
  status: string;
  created_at: string;
  last_opened_at: string | null;
  completion_pct: number | null;
  is_favorite: boolean;
  tags: string[];
  trade_count: number;
  net_pnl: number;
  score: number | null;
}

/**
 * Replay history with per-session aggregates.
 *
 * Trades and scores are fetched once for the whole page rather than per row —
 * a virtualized list must never fan out N+1 requests.
 */
export async function buildHistory(
  supabase: DB,
  opts: { limit: number; offset: number; status?: string | null; symbol?: string | null; search?: string | null },
): Promise<{ rows: HistoryRow[]; total: number }> {
  let query = supabase
    .from("replay_sessions")
    .select("id, title, symbol, timeframe, status, created_at, last_opened_at, completion_pct, is_favorite, tags", {
      count: "exact",
    })
    .is("deleted_at", null);

  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  if (opts.symbol) query = query.eq("symbol", opts.symbol);
  if (opts.search) query = query.ilike("title", `%${opts.search}%`);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw error;

  const sessions = (data ?? []) as JsonRow[];
  const ids = sessions.map((s) => String(s.id));
  if (ids.length === 0) return { rows: [], total: count ?? 0 };

  const [tradesRes, scoresRes] = await Promise.all([
    supabase.from("chart_closed_trades").select("replay_session_id, net_pnl").in("replay_session_id", ids),
    supabase.from("replay_scores").select("session_id, score, created_at").in("session_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const agg = new Map<string, { count: number; pnl: number }>();
  for (const t of (tradesRes.data ?? []) as { replay_session_id: string; net_pnl: number }[]) {
    const cur = agg.get(t.replay_session_id) ?? { count: 0, pnl: 0 };
    cur.count += 1;
    cur.pnl += Number(t.net_pnl) || 0;
    agg.set(t.replay_session_id, cur);
  }

  const scores = new Map<string, number>();
  for (const s of (scoresRes.data ?? []) as { session_id: string; score: number }[]) {
    if (!scores.has(s.session_id)) scores.set(s.session_id, Number(s.score));
  }

  const rows: HistoryRow[] = sessions.map((s) => {
    const a = agg.get(String(s.id)) ?? { count: 0, pnl: 0 };
    return {
      id: String(s.id),
      title: String(s.title ?? "Untitled replay"),
      symbol: String(s.symbol ?? ""),
      timeframe: String(s.timeframe ?? ""),
      status: String(s.status ?? "draft"),
      created_at: String(s.created_at),
      last_opened_at: (s.last_opened_at as string) ?? null,
      completion_pct: s.completion_pct != null ? Number(s.completion_pct) : null,
      is_favorite: !!s.is_favorite,
      tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
      trade_count: a.count,
      net_pnl: a.pnl,
      score: scores.get(String(s.id)) ?? null,
    };
  });

  return { rows, total: count ?? rows.length };
}
