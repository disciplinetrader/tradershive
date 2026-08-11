/**
 * Trader Intelligence — server function.
 * Pulls trades + journals + strategies (RLS-scoped to the caller) and hands
 * them to the deterministic engine in @/lib/ai/intelligence. No LLM calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  AI_JOURNAL_SELECT,
  buildIntelligence,
  toRawJournal,
  type RawTrade,
  type StrategyRef,
} from "@/lib/ai/intelligence";

const inputSchema = z.object({ days: z.number().int().min(7).max(365).default(30) });

export const getTraderIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const [tradesRes, journalsRes, stratsRes] = await Promise.all([
      supabase
        .from("paper_trades")
        .select(
          "id, symbol, market, direction, status, pnl, rr_realized, rr_planned, risk_amount, stop_loss, take_profit, entry_price, exit_price, opened_at, closed_at, strategy_id, close_reason, notes",
        )
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("opened_at", since)
        .order("closed_at", { ascending: false })
        .limit(1000),
      supabase
        .from("journal_entries")
        .select(AI_JOURNAL_SELECT)
        .eq("user_id", userId)
        .gte("created_at", since)
        .limit(1000),
      supabase.from("strategies").select("id, name").eq("user_id", userId).limit(200),
    ]);

    const trades = (tradesRes.data ?? []) as unknown as RawTrade[];
    const journals = (journalsRes.data ?? []).map(toRawJournal);
    const strategies = (stratsRes.data ?? []) as unknown as StrategyRef[];

    return buildIntelligence(trades, journals, strategies, data.days);
  });
