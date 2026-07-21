/**
 * Universal Trade Details — server surface.
 *
 * Fetches a single unified trade object regardless of source (paper or replay),
 * along with related journal entry, timeline events, AI review, attachments,
 * and related-trade suggestions. Ownership is enforced via RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TradeSource = "paper" | "replay";

const paramsSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["paper", "replay"]).default("paper"),
});

export const getTradeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => paramsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, source } = data;
    const { supabase, userId } = context;

    if (source === "paper") {
      const { data: trade, error } = await supabase
        .from("paper_trades")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!trade) throw new Error("Trade not found");

      const [journal, events, aiReview, related] = await Promise.all([
        supabase.from("journal_entries").select("*").eq("trade_id", id).eq("user_id", userId).maybeSingle(),
        supabase.from("position_history").select("*").eq("trade_id", id).eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.from("ai_trade_reviews").select("*").eq("trade_id", id).eq("user_id", userId).is("superseded_by", null).order("version", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("paper_trades").select("id, symbol, direction, pnl, closed_at, status").eq("user_id", userId).eq("symbol", trade.symbol).neq("id", id).is("deleted_at", null).order("opened_at", { ascending: false }).limit(8),
      ]);

      const attachments = journal.data
        ? (await supabase.from("journal_attachments").select("*").eq("entry_id", journal.data.id).eq("user_id", userId)).data ?? []
        : [];

      return {
        source: "paper" as const,
        trade,
        journal: journal.data ?? null,
        events: events.data ?? [],
        ai_review: aiReview.data ?? null,
        attachments,
        related: related.data ?? [],
      };
    }

    // Replay trade
    const { data: trade, error } = await supabase
      .from("replay_trades")
      .select("*, replay_sessions(id, title, symbol, timeframe, market, mode)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!trade) throw new Error("Trade not found");

    const [bookmarks, notes, related] = await Promise.all([
      supabase.from("replay_bookmarks").select("*").eq("session_id", trade.session_id).eq("user_id", userId).order("bookmark_ts"),
      supabase.from("replay_notes").select("*").eq("session_id", trade.session_id).eq("user_id", userId).order("note_ts"),
      supabase.from("replay_trades").select("id, symbol, direction, pnl, closed_at, status, session_id").eq("user_id", userId).eq("symbol", trade.symbol).neq("id", id).order("opened_at", { ascending: false }).limit(8),
    ]);

    return {
      source: "replay" as const,
      trade,
      session: (trade as any).replay_sessions ?? null,
      bookmarks: bookmarks.data ?? [],
      notes: notes.data ?? [],
      related: related.data ?? [],
    };
  });

export type TradeDetails = Awaited<ReturnType<typeof getTradeDetails>>;
