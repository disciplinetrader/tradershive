import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEnginePricedSymbol } from "@/lib/replay/battle-pnl";

/**
 * Record a replay-battle fill in `paper_trades`.
 *
 * The engine executes replay fills client-side against a dataset every
 * participant shares, then hands the resulting closed trade here. This is a
 * write path, not an execution path — the fill has already happened.
 *
 * **Step 5 replaces the trust model here, not the shape.** Today the server
 * checks that the trade is plausible: the account belongs to the caller, it
 * belongs to this battle, the symbol is engine-priceable, the cursor is sane.
 * It does NOT yet recompute the fill from its own copy of the dataset, so a
 * modified client could still claim a price the market never traded at. That is
 * precisely why replay battles are unranked, enforced by
 * `battles_replay_must_be_unranked`.
 */

const tradeSchema = z.object({
  battleId: z.string().uuid(),
  accountId: z.string().uuid(),
  symbol: z.string().min(1),
  market: z.string().min(1),
  direction: z.enum(["long", "short"]),
  orderType: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  lotSize: z.number().positive(),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive(),
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  riskAmount: z.number().nonnegative().nullable().optional(),
  /** Engine-derived. Written through, never recomputed — see battle-pnl.ts. */
  pnl: z.number(),
  rrRealized: z.number(),
  commission: z.number().nonnegative().default(0),
  closeReason: z.string().nullable().optional(),
  /** Market time, not battle wall-clock. */
  openedAt: z.string(),
  closedAt: z.string(),
  observationCursor: z.number().int().min(0),
});

export const recordBattleReplayTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // The account must be this user's AND belong to this battle. Checking both
    // closes the obvious abuse: submitting a winning trade against someone
    // else's battle account, or against a personal account to dodge the rules
    // triggers.
    const { data: account, error: acctErr } = await supabase
      .from("paper_accounts")
      .select("id, user_id, battle_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!account || account.user_id !== userId) throw new Error("Account not found");
    if (account.battle_id !== data.battleId) {
      throw new Error("That account does not belong to this battle");
    }

    const { data: battle, error: battleErr } = await supabase
      .from("battles")
      .select("id, status, ranked, replay_dataset_id, replay_symbol")
      .eq("id", data.battleId)
      .maybeSingle();
    if (battleErr) throw battleErr;
    if (!battle) throw new Error("Battle not found");
    if (!battle.replay_dataset_id) {
      throw new Error("This is not a replay battle");
    }
    // Belt and braces against the schema constraint. If this ever fires, a
    // ranked replay battle exists and rating is being minted from unvalidated
    // client fills — refuse rather than record it.
    if (battle.ranked) {
      throw new Error("Ranked replay battles are not supported");
    }
    if (data.symbol !== battle.replay_symbol) {
      throw new Error("Trade symbol does not match the battle's dataset");
    }
    if (!isEnginePricedSymbol(data.symbol)) {
      throw new Error(
        `${data.symbol} is not priced in the account currency; replay battles are ` +
          "limited to USD-quoted symbols",
      );
    }

    // `enforce_battle_rules_on_trade` still runs on insert and owns the real
    // rules — battle live, inside the window, symbol allowed. Its errors surface
    // to the client through the global error middleware.
    const { data: row, error } = await supabase
      .from("paper_trades")
      .insert({
        user_id: userId,
        account_id: data.accountId,
        battle_id: data.battleId,
        symbol: data.symbol,
        market: data.market as never,
        direction: data.direction as never,
        order_type: data.orderType as never,
        status: "closed" as never,
        lot_size: data.lotSize,
        entry_price: data.entryPrice,
        exit_price: data.exitPrice,
        stop_loss: data.stopLoss ?? null,
        take_profit: data.takeProfit ?? null,
        risk_amount: data.riskAmount ?? null,
        pnl: data.pnl,
        rr_realized: data.rrRealized,
        commission: data.commission,
        close_reason: (data.closeReason ?? null) as never,
        opened_at: data.openedAt,
        closed_at: data.closedAt,
        observation_cursor: data.observationCursor,
      })
      .select("id, pnl, battle_id, observation_cursor")
      .single();
    if (error) throw error;

    return row;
  });
