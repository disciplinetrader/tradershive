/**
 * JOURNAL X — PHASE 4 · data layer for replay practice attempts.
 *
 * One journal trade → many replay attempts. Each attempt is a single row in
 * `replay_comparisons` that points at the original entry, the replay session
 * that was spawned for it and (once completed) the replay trade produced.
 *
 * Reads and writes go through the RLS-scoped browser client, exactly like the
 * rest of the Journal X data layer. No new replay engine is introduced — the
 * attempt simply owns a normal replay session.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { JournalEntry } from "@/lib/journal/api";
import { TIMEFRAME_SECONDS, DEFAULT_CHECKLIST } from "@/lib/replay/constants";
import type {
  AttemptIntent,
  AttemptReflection,
  AttemptTelemetry,
  PracticeMode,
  Readiness,
} from "@/lib/journal/replay-compare";

export type AttemptRow = Database["public"]["Tables"]["replay_comparisons"]["Row"];
export type ReplayTradeRow = Database["public"]["Tables"]["replay_trades"]["Row"];
export type ReplaySessionRow = Database["public"]["Tables"]["replay_sessions"]["Row"];

export type Attempt = AttemptRow & {
  intentObj: AttemptIntent;
  reflectionObj: AttemptReflection;
  telemetryObj: AttemptTelemetry;
};

export const attemptKeys = {
  all: ["replay-attempts"] as const,
  forEntry: (entryId: string) => ["replay-attempts", "entry", entryId] as const,
  one: (id: string) => ["replay-attempts", "one", id] as const,
  trades: (sessionId: string) => ["replay-attempts", "trades", sessionId] as const,
  session: (sessionId: string) => ["replay-attempts", "session", sessionId] as const,
  bySession: (sessionId: string) => ["replay-attempts", "by-session", sessionId] as const,
  mine: () => ["replay-attempts", "mine"] as const,
};

const obj = <T,>(v: unknown): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));

export function hydrate(row: AttemptRow): Attempt {
  return {
    ...row,
    intentObj: obj<AttemptIntent>(row.intent),
    reflectionObj: obj<AttemptReflection>(row.reflection),
    telemetryObj: obj<AttemptTelemetry>(row.telemetry),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listAttempts(entryId: string): Promise<Attempt[]> {
  const { data, error } = await supabase
    .from("replay_comparisons")
    .select("*")
    .eq("original_entry_id", entryId)
    .order("attempt_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function listMyAttempts(limit = 400): Promise<Attempt[]> {
  const { data, error } = await supabase
    .from("replay_comparisons")
    .select("*")
    .not("original_entry_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const { data, error } = await supabase.from("replay_comparisons").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? hydrate(data) : null;
}

/** The in-progress attempt attached to a replay session, if any. */
export async function getAttemptBySession(sessionId: string): Promise<Attempt | null> {
  const { data, error } = await supabase
    .from("replay_comparisons")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? hydrate(data) : null;
}

export async function fetchReplayTrades(sessionId: string): Promise<ReplayTradeRow[]> {
  const { data, error } = await supabase
    .from("replay_trades")
    .select("*")
    .eq("session_id", sessionId)
    .order("opened_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchReplaySession(sessionId: string): Promise<ReplaySessionRow | null> {
  const { data, error } = await supabase.from("replay_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Lightweight telemetry pulled from the event stream the studio already writes. */
export async function collectTelemetry(sessionId: string): Promise<AttemptTelemetry> {
  const { data, error } = await supabase
    .from("replay_events")
    .select("event_type")
    .eq("session_id", sessionId)
    .limit(1000);
  if (error) return {};
  const rows = data ?? [];
  const count = (needle: string) => rows.filter((r) => (r.event_type ?? "").includes(needle)).length;
  return {
    events: rows.length,
    pauses: count("pause"),
    rewinds: count("rewind"),
    speed_changes: count("speed"),
    stop_changes: count("stop_"),
    partials: count("partial"),
    break_even: count("break_even"),
    entries: count("trade_open"),
    exits: count("trade_close"),
  };
}

/* ------------------------------------------------------------------ */
/* Session creation                                                    */
/* ------------------------------------------------------------------ */

const TF_ORDER: (keyof typeof TIMEFRAME_SECONDS)[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];
const ALLOWED_MARKETS = new Set(["forex", "crypto", "stocks", "indices", "commodities", "futures"]);

function pickTimeframe(durationSec: number): keyof typeof TIMEFRAME_SECONDS {
  // Aim for roughly 60–200 candles across the trade's own life.
  for (const tf of TF_ORDER) {
    const step = TIMEFRAME_SECONDS[tf];
    if (durationSec / step <= 200) return tf;
  }
  return "1D";
}

/**
 * Spawns a replay session positioned before the original entry. Future
 * information stays hidden (`hide_future`), and the practice context is
 * stored on `settings.practice` so the studio can render the attempt bar.
 */
async function createPracticeSession(input: {
  userId: string;
  entry: JournalEntry;
  mode: PracticeMode;
  intent: AttemptIntent;
  attemptNumber: number;
  mistake?: string;
}): Promise<ReplaySessionRow> {
  const { entry, mode } = input;
  const openedMs = entry.opened_at ? +new Date(entry.opened_at) : +new Date(entry.created_at);
  const closedMs = entry.closed_at ? +new Date(entry.closed_at) : openedMs + 4 * 3600 * 1000;
  const durationSec = Math.max(60, Math.round((closedMs - openedMs) / 1000));
  const tf = pickTimeframe(durationSec);
  const step = TIMEFRAME_SECONDS[tf];
  const contextSec = step * 60; // ~60 candles of lead-in before the original entry

  const rangeStart = new Date(openedMs - contextSec * 1000).toISOString();
  const rangeEnd = new Date(closedMs + step * 30 * 1000).toISOString();
  // Playback starts well before the original entry so nothing is given away.
  const cursorTs = new Date(openedMs - Math.round(contextSec * 0.35) * 1000).toISOString();

  const market = entry.market && ALLOWED_MARKETS.has(entry.market) ? entry.market : "forex";

  const blind = mode === "blind";
  const practice = {
    entry_id: entry.id,
    mode,
    attempt_number: input.attemptNumber,
    hide_original: blind,
    mistake_focus: input.mistake ?? null,
    reference: blind
      ? null
      : {
          symbol: entry.symbol,
          setup: entry.setup,
          session: entry.session,
          timeframe: tf,
          // Retry-plan exposes the plan (stop/target) but never the result.
          stop: mode === "retry_plan" ? entry.stop_loss : null,
          target: mode === "retry_plan" ? entry.take_profit : null,
          direction: mode === "retry_plan" ? entry.direction : null,
        },
  };

  const { data: session, error } = await supabase
    .from("replay_sessions")
    .insert({
      user_id: input.userId,
      title: `Attempt ${input.attemptNumber} · ${entry.symbol ?? "Trade"} · ${new Date(openedMs).toISOString().slice(0, 10)}`,
      mode: "range",
      market,
      symbol: entry.symbol ?? "EURUSD",
      timeframe: tf,
      replay_date: null,
      range_start: rangeStart,
      range_end: rangeEnd,
      source_trade_id: entry.trade_id,
      source_journal_id: entry.id,
      provider: "synthetic",
      tags: ["practice", mode],
      cursor_ts: cursorTs,
      hide_future: true,
      last_opened_at: new Date().toISOString(),
      settings: { practice },
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("replay_checklists").insert(
    DEFAULT_CHECKLIST.map((label, i) => ({ session_id: session.id, user_id: input.userId, label, sort_order: i })),
  );

  return session;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function startAttempt(input: {
  userId: string;
  entry: JournalEntry;
  mode: PracticeMode;
  intent: AttemptIntent;
  mistake?: string;
}): Promise<{ attempt: Attempt; sessionId: string }> {
  const existing = await listAttempts(input.entry.id);
  const attemptNumber = existing.reduce((max, a) => Math.max(max, a.attempt_number), 0) + 1;

  const session = await createPracticeSession({ ...input, attemptNumber });

  const { data, error } = await supabase
    .from("replay_comparisons")
    .insert({
      user_id: input.userId,
      session_id: session.id,
      original_entry_id: input.entry.id,
      original_trade_id: input.entry.trade_id,
      attempt_number: attemptNumber,
      mode: input.mode,
      status: "in_progress",
      intent: (input.intent ?? {}) as never,
      breakdown: {} as never,
    })
    .select()
    .single();
  if (error) throw error;
  return { attempt: hydrate(data), sessionId: session.id };
}

export async function updateIntent(id: string, intent: AttemptIntent): Promise<void> {
  const { error } = await supabase.from("replay_comparisons").update({ intent: intent as never }).eq("id", id);
  if (error) throw error;
}

export type CompletePayload = {
  breakdown: unknown;
  process_delta: number | null;
  outcome_delta: number | null;
  verdict: Readiness | null;
  replay_trade_id: string | null;
  entry_diff: number | null;
  exit_diff: number | null;
  rr_diff: number | null;
  timing_diff_seconds: number | null;
  result_diff: number | null;
  telemetry: AttemptTelemetry;
};

export async function completeAttempt(id: string, payload: CompletePayload): Promise<Attempt> {
  const { data, error } = await supabase
    .from("replay_comparisons")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      comparison_version: 1,
      breakdown: payload.breakdown as never,
      telemetry: payload.telemetry as never,
      process_delta: payload.process_delta,
      outcome_delta: payload.outcome_delta,
      verdict: payload.verdict,
      replay_trade_id: payload.replay_trade_id,
      entry_diff: payload.entry_diff,
      exit_diff: payload.exit_diff,
      rr_diff: payload.rr_diff,
      timing_diff_seconds: payload.timing_diff_seconds,
      result_diff: payload.result_diff,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This attempt is no longer available.");
  return hydrate(data);
}

export async function abandonAttempt(id: string): Promise<void> {
  const { error } = await supabase.from("replay_comparisons").update({ status: "abandoned" }).eq("id", id);
  if (error) throw error;
}

export async function saveReflection(id: string, reflection: AttemptReflection): Promise<void> {
  const { error } = await supabase.from("replay_comparisons").update({ reflection: reflection as never }).eq("id", id);
  if (error) throw error;
}

export async function saveEvaluation(id: string, review: unknown): Promise<void> {
  const { error } = await supabase.from("replay_comparisons").update({ ai_review: review as never }).eq("id", id);
  if (error) throw error;
}

export async function markBestAttempt(entryId: string, attemptId: string): Promise<void> {
  const { error: clearErr } = await supabase
    .from("replay_comparisons")
    .update({ is_best: false })
    .eq("original_entry_id", entryId);
  if (clearErr) throw clearErr;
  const { error } = await supabase.from("replay_comparisons").update({ is_best: true }).eq("id", attemptId);
  if (error) throw error;
}

/** Removes the link only — the replay session and its trades are preserved. */
export async function deleteAttemptLink(id: string): Promise<void> {
  const { error } = await supabase.from("replay_comparisons").delete().eq("id", id);
  if (error) throw error;
}
