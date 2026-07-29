/**
 * Journal auto-draft from a finished replay session.
 *
 * Runs on the client after Finish so we can reuse the browser Supabase client
 * (same RLS context as the Journal itself) and avoid duplicate typing for the
 * user. Prefills:
 *   - symbol, market, direction (dominant side of the session)
 *   - entry / exit / pnl / rr from aggregated trades
 *   - notes with a session summary + AI observation
 *   - AI review payload if a debrief is available
 *   - Session metadata so the entry links back to the replay
 */
import { createEntry, type EntryInsert } from "@/lib/journal/api";
import { supabase } from "@/integrations/supabase/client";
import type { ReplaySession, ReplayTrade } from "./types";

type Totals = {
  trades: number;
  net_profit: number;
  win_rate: number;
  avg_rr: number;
  profit_factor: number;
  max_drawdown: number;
};

type Debrief = {
  overall_summary?: string;
  grade?: string;
  wins?: string[];
  mistakes?: Array<string | { description?: string; kind?: string }>;
  action_items?: string[];
};

function dominantDirection(trades: ReplayTrade[]): "long" | "short" | null {
  if (!trades.length) return null;
  const longs = trades.filter((t) => t.direction === "long").length;
  return longs >= trades.length / 2 ? "long" : "short";
}

function summariseMistake(m: unknown): string {
  if (!m) return "";
  if (typeof m === "string") return m;
  const obj = m as { description?: string; kind?: string };
  return obj.description ?? obj.kind ?? "";
}

export async function createJournalDraftFromReplay(input: {
  session: ReplaySession;
  trades: ReplayTrade[];
  totals: Totals | null;
  debrief?: Debrief | null;
  notes?: string[];
  checklist?: Array<{ label: string; is_checked: boolean }>;
  screenshotUrls?: string[];
}): Promise<{ id: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const user_id = userData.user?.id;
  if (!user_id) throw new Error("Not signed in");

  const { session, trades, totals, debrief } = input;
  const closed = trades.filter((t) => t.exit_price != null);
  const first = closed[0];
  const last = closed[closed.length - 1] ?? first;
  const dir = dominantDirection(closed);

  const aiObservation = debrief?.overall_summary ?? null;
  const nextStep = debrief?.action_items?.[0] ?? null;
  const strength = debrief?.wins?.[0] ?? null;
  const mistake = summariseMistake(debrief?.mistakes?.[0]);

  const noteLines: string[] = [
    `Replay Session: ${session.title}`,
    `${session.symbol} · ${session.timeframe} · ${session.market}`,
    "",
    totals
      ? `Result: ${totals.net_profit >= 0 ? "+" : ""}${totals.net_profit.toFixed(2)} · ${totals.trades} trades · Win rate ${totals.win_rate.toFixed(0)}% · PF ${totals.profit_factor.toFixed(2)}`
      : "No trades placed.",
  ];
  if (aiObservation) noteLines.push("", `AI observation: ${aiObservation}`);
  if (strength) noteLines.push(`Strength: ${strength}`);
  if (mistake) noteLines.push(`Key mistake: ${mistake}`);
  if (nextStep) noteLines.push(`Next step: ${nextStep}`);
  if (input.notes?.length) {
    noteLines.push("", "Notes:");
    for (const n of input.notes) noteLines.push(`• ${n}`);
  }

  const checklist = (input.checklist ?? []).map((c, i) => ({
    id: `chk-${i}`,
    label: c.label,
    checked: c.is_checked,
  }));

  const draft: EntryInsert = {
    user_id,
    status: "draft",
    symbol: session.symbol,
    market: session.market,
    direction: dir,
    entry_price: first?.entry_price ?? null,
    exit_price: last?.exit_price ?? null,
    stop_loss: first?.stop_loss ?? null,
    take_profit: first?.take_profit ?? null,
    lot_size: first?.lot_size ?? null,
    opened_at: first?.opened_at ?? session.range_start ?? null,
    closed_at: last?.closed_at ?? null,
    pnl: totals?.net_profit ?? null,
    rr: totals?.avg_rr ?? null,
    notes_text: noteLines.join("\n"),
    entry_reason_text: strength ?? null,
    checklist: checklist as unknown as EntryInsert["checklist"],
    screenshots: input.screenshotUrls ?? [],
    grade: (debrief?.grade as EntryInsert["grade"]) ?? null,
    ai_review: (debrief ?? null) as EntryInsert["ai_review"],
    strategy_tags: [`replay:${session.id}`],
    is_favorite: false,
    is_public: false,
  };

  const row = await createEntry(draft);
  return { id: row.id };
}
