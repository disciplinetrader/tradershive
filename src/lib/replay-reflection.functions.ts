/**
 * Phase 8C · Reflection layer server functions.
 *
 * The reflection layer (notes, bookmarks, checkpoints, checklists,
 * screenshots, coach, scoring) hangs off `replay_sessions` — the same
 * canonical session the Phase 8A engine owns. Reflection data is
 * observational: it NEVER modifies execution facts, orders or closed trades.
 *
 * Persistence contract:
 *   · every row is owner-isolated by RLS (`user_id = auth.uid()`)
 *   · reads are keyed by session, so resume works cross-device
 *   · nothing here writes into `settings.engine_v1` — the engine snapshot is
 *     reserved for the clock/dataset and must stay small
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReplayScore } from "./replay/score";
import { refreshReplayStatistics } from "./replay/statistics.server";

const sessionInput = z.object({ session_id: z.string().uuid() });

/** One round-trip for every reflection artefact attached to a session. */
export const getReplayReflection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sessionInput.parse(d))
  .handler(async ({ data, context }) => {
    const id = data.session_id;
    const [notes, bookmarks, checklist, checkpoints, screenshots, score] = await Promise.all([
      context.supabase.from("replay_notes").select("*").eq("session_id", id).order("note_ts"),
      context.supabase.from("replay_bookmarks").select("*").eq("session_id", id).order("bookmark_ts"),
      context.supabase.from("replay_checklists").select("*").eq("session_id", id).order("sort_order"),
      context.supabase.from("replay_checkpoints").select("*").eq("session_id", id).order("checkpoint_ts"),
      context.supabase.from("replay_screenshots").select("*").eq("session_id", id).order("captured_ts", { ascending: false }),
      context.supabase
        .from("replay_scores").select("*").eq("session_id", id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return {
      notes: notes.data ?? [],
      bookmarks: bookmarks.data ?? [],
      checklist: checklist.data ?? [],
      checkpoints: checkpoints.data ?? [],
      screenshots: screenshots.data ?? [],
      score: score.data ?? null,
    };
  });

export const deleteReplayChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("replay_checklists").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Score a canonical Studio session.
 *
 * The caller supplies the execution facts produced by the canonical engine
 * (immutable `ClosedTrade` records, already adapted by
 * `reflection/adapter.ts`). Scoring itself runs here, through the single
 * shared `computeReplayScore` formula — there is no second scoring path.
 */
export const scoreReplaySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        session_id: z.string().uuid(),
        trades: z
          .array(
            z.object({
              status: z.literal("closed"),
              stop_loss: z.number().nullable(),
              risk_pct: z.number().optional(),
              pnl: z.number(),
              rr_realized: z.number().nullable(),
            }),
          )
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const id = data.session_id;

    const [checklist, bookmarks, notes] = await Promise.all([
      context.supabase.from("replay_checklists").select("*").eq("session_id", id),
      context.supabase.from("replay_bookmarks").select("*").eq("session_id", id),
      context.supabase.from("replay_notes").select("id, body").eq("session_id", id),
    ]);

    const breakdown = computeReplayScore({
      trades: data.trades as never,
      checklist: (checklist.data ?? []) as never,
      bookmarks: (bookmarks.data ?? []) as never,
      notesCount: (notes.data ?? []).length,
    });

    const { data: score, error } = await context.supabase
      .from("replay_scores")
      .insert({
        session_id: id,
        user_id: context.userId,
        score: breakdown.score,
        discipline: breakdown.discipline,
        risk: breakdown.risk,
        execution: breakdown.execution,
        patience: breakdown.patience,
        consistency: breakdown.consistency,
        journal_completion: breakdown.journal_completion,
        breakdown: { notes: breakdown.notes, tradeCount: data.trades.length, source: "canonical" },
      })
      .select()
      .single();
    if (error) throw error;

    await context.supabase
      .from("replay_sessions")
      .update({ status: "completed", completion_pct: 100 })
      .eq("id", id);

    await refreshReplayStatistics(context.supabase, context.userId);

    return { score, breakdown };
  });
