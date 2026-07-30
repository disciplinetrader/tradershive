/**
 * JOURNAL X — PHASE 5 · lightweight homework.
 *
 * A recommended drill that the trader accepted. Stored on the existing
 * `replay_homework` table (extended with journal fields) so the AI Coach
 * homework surface and Journal practice share one queue instead of two.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { PracticeMode } from "@/lib/journal/replay-compare";
import type { DrillRecommendation } from "@/lib/journal/improvement";

export type HomeworkRow = Database["public"]["Tables"]["replay_homework"]["Row"] & {
  title?: string | null;
  skill?: string | null;
  source_entry_id?: string | null;
  source_comparison_id?: string | null;
  replay_mode?: string | null;
  target_mistake?: string | null;
  measurable_goal?: string | null;
  priority?: number | null;
  origin?: string | null;
  result?: unknown;
};

export type HomeworkStatus = "suggested" | "accepted" | "in_progress" | "completed" | "dismissed";

export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  suggested: "Suggested",
  accepted: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
  dismissed: "Dismissed",
};

export const OPEN_STATUSES: HomeworkStatus[] = ["suggested", "accepted", "in_progress"];

export const homeworkKeys = {
  all: ["journal-homework"] as const,
  list: () => ["journal-homework", "list"] as const,
};

export async function listJournalHomework(limit = 50): Promise<HomeworkRow[]> {
  const { data, error } = await supabase
    .from("replay_homework")
    .select("*")
    .eq("origin", "journal")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as HomeworkRow[];
}

/** Accepts a deterministic recommendation into the queue. */
export async function acceptDrill(input: {
  userId: string;
  rec: DrillRecommendation;
  symbol?: string | null;
  market?: string | null;
  comparisonId?: string | null;
}): Promise<HomeworkRow> {
  const { rec } = input;
  const { data, error } = await supabase
    .from("replay_homework")
    .insert({
      user_id: input.userId,
      origin: "journal",
      status: "accepted",
      title: rec.title,
      skill: rec.skill,
      source_entry_id: rec.entryId,
      source_comparison_id: input.comparisonId ?? null,
      replay_mode: rec.mode,
      target_mistake: rec.mistake,
      measurable_goal: rec.target,
      priority: rec.score,
      reason: rec.reason,
      symbol: input.symbol ?? null,
      market: input.market ?? null,
      timeframe: null,
      difficulty: null,
      target_r: null,
      max_trades: null,
      session_hint: null,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as HomeworkRow;
}

export async function setHomeworkStatus(id: string, status: HomeworkStatus, result?: unknown): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "completed") patch.completed_at = new Date().toISOString();
  if (result !== undefined) patch.result = result;
  const { error } = await supabase.from("replay_homework").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteHomework(id: string): Promise<void> {
  const { error } = await supabase.from("replay_homework").delete().eq("id", id);
  if (error) throw error;
}

export const homeworkMode = (row: HomeworkRow): PracticeMode => (row.replay_mode as PracticeMode) ?? "standard";
