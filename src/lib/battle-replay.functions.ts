import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEnginePricedSymbol } from "@/lib/replay/battle-pnl";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { pnl as computePnl } from "@/lib/paper-trading/calculations";

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
    const sym = findSymbol(data.symbol);
    if (!sym || !isEnginePricedSymbol(data.symbol)) {
      throw new Error(
        `${data.symbol} is not priced in the account currency; replay battles are ` +
          "limited to USD-quoted symbols",
      );
    }

    // Authoritative P&L (D-6 crossover): the server recomputes the number from
    // the fill prices using its own paper formula and discards the client's
    // `pnl` / `rrRealized`. For the engine-priced symbols admitted above the
    // paper formula is provably identical to the engine's, so the recomputed
    // number matches the blotter the trader watched — see battle-pnl.ts — while
    // a modified client can no longer inject an arbitrary P&L. The prices
    // themselves are bounded to the traded candle range inside the RPC.
    const gross = computePnl(
      sym, data.direction, Number(data.entryPrice), Number(data.exitPrice), Number(data.lotSize),
    );
    const netPnl = gross - Number(data.commission ?? 0);
    const rrRealized = data.riskAmount && Number(data.riskAmount) > 0
      ? netPnl / Number(data.riskAmount) : 0;

    // The account/battle/ranked/symbol checks and the price-in-range authority
    // live in the service-role RPC, which is now the only writer of a
    // paper_trades row (authenticated INSERT is revoked in I2d).
    // `enforce_battle_rules_on_trade` still fires on the insert inside it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settled, error } = await supabaseAdmin.rpc("record_battle_replay_trade" as never, {
      _user_id: userId,
      _battle_id: data.battleId,
      _account_id: data.accountId,
      _fields: {
        symbol: data.symbol,
        market: data.market,
        direction: data.direction,
        order_type: data.orderType,
        lot_size: data.lotSize,
        entry_price: data.entryPrice,
        exit_price: data.exitPrice,
        stop_loss: data.stopLoss ?? null,
        take_profit: data.takeProfit ?? null,
        risk_amount: data.riskAmount ?? null,
        pnl: netPnl,
        rr_realized: rrRealized,
        commission: data.commission ?? 0,
        close_reason: data.closeReason ?? null,
        opened_at: data.openedAt,
        closed_at: data.closedAt,
        observation_cursor: data.observationCursor,
      },
    } as never);
    if (error) throw error;
    const row = (Array.isArray(settled) ? settled[0] : settled) as
      | { id: string; pnl: number; battle_id: string; observation_cursor: number } | undefined;
    return row ?? null;
  });
