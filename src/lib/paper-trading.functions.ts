import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findSymbol } from "./paper-trading/symbols";
import { pnl as computePnl, pipsBetween } from "./paper-trading/calculations";

/* ---------------- Accounts ---------------- */

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("paper_accounts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  starting_balance: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default("USD"),
  leverage: z.number().int().min(1).max(500).default(100),
  max_daily_risk_pct: z.number().min(0.1).max(50).default(5),
  max_trade_risk_pct: z.number().min(0.1).max(50).default(2),
  margin_call_level: z.number().min(0).max(1000).default(100),
  stop_out_level: z.number().min(0).max(1000).default(50),
  negative_balance_protection: z.boolean().default(true),
}).refine((v) => v.margin_call_level >= v.stop_out_level, {
  message: "margin_call_level must be ≥ stop_out_level",
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createAccountSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: acct, error } = await context.supabase
      .from("paper_accounts")
      .insert({
        user_id: context.userId,
        name: data.name,
        currency: data.currency,
        starting_balance: data.starting_balance,
        balance: data.starting_balance,
        equity: data.starting_balance,
        leverage: data.leverage,
        max_daily_risk_pct: data.max_daily_risk_pct,
        max_trade_risk_pct: data.max_trade_risk_pct,
        margin_call_level: data.margin_call_level,
        stop_out_level: data.stop_out_level,
        negative_balance_protection: data.negative_balance_protection,
      })
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("account_statistics").insert({ account_id: acct.id, user_id: context.userId });
    return acct;
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(60).optional(),
        leverage: z.number().int().min(1).max(500).optional(),
        max_daily_risk_pct: z.number().min(0.1).max(50).optional(),
        max_trade_risk_pct: z.number().min(0.1).max(50).optional(),
        is_archived: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("paper_accounts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const resetAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: acct, error } = await context.supabase
      .from("paper_accounts").select("starting_balance").eq("id", data.id).eq("user_id", context.userId).single();
    if (error) throw error;
    await context.supabase
      .from("paper_accounts")
      .update({ balance: acct.starting_balance, equity: acct.starting_balance })
      .eq("id", data.id).eq("user_id", context.userId);
    await context.supabase.from("paper_trades").update({ deleted_at: new Date().toISOString() })
      .eq("account_id", data.id).eq("user_id", context.userId).is("deleted_at", null);
    await context.supabase.from("paper_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("account_id", data.id).eq("user_id", context.userId).eq("status", "pending");
    await context.supabase.from("account_statistics").upsert({
      account_id: data.id, user_id: context.userId,
      total_trades: 0, wins: 0, losses: 0, breakevens: 0, win_rate: 0,
      gross_profit: 0, gross_loss: 0, net_pnl: 0, best_trade: 0, worst_trade: 0,
    });
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Soft delete — preserves audit history per business rules.
    const { error } = await context.supabase
      .from("paper_accounts")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------- Trades ---------------- */

const openTradeSchema = z.object({
  account_id: z.string().uuid(),
  symbol: z.string().min(1),
  market: z.enum(["forex","crypto","stocks","indices","futures","metals"]),
  direction: z.enum(["long","short"]),
  order_type: z.enum(["market","limit","stop","stop_limit"]).default("market"),
  lot_size: z.number().positive(),
  entry_price: z.number().positive(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  risk_amount: z.number().nullable().optional(),
  reward_amount: z.number().nullable().optional(),
  rr_planned: z.number().nullable().optional(),
  commission: z.number().min(0).default(0),
  swap: z.number().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
  screenshot_path: z.string().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export const openTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => openTradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { tag_ids, ...trade } = data;
    const { data: created, error } = await context.supabase
      .from("paper_trades")
      .insert({ ...trade, user_id: context.userId, status: "open", opened_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    if (tag_ids?.length) {
      await context.supabase.from("trade_tag_relations").insert(
        tag_ids.map((tid) => ({ trade_id: created.id, tag_id: tid, user_id: context.userId })),
      );
    }
    await context.supabase.from("position_history").insert({
      user_id: context.userId, account_id: data.account_id, trade_id: created.id,
      event: "opened", payload: { entry_price: data.entry_price, lot_size: data.lot_size },
    });
    return created;
  });

const modifyTradeSchema = z.object({
  id: z.string().uuid(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const modifyTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => modifyTradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("paper_trades").update(patch).eq("id", id).eq("user_id", context.userId).eq("status", "open");
    if (error) throw error;
    const { data: t } = await context.supabase.from("paper_trades")
      .select("account_id").eq("id", id).maybeSingle();
    if (t?.account_id) {
      await context.supabase.from("position_history").insert({
        user_id: context.userId, account_id: t.account_id, trade_id: id,
        event: "modified",
        payload: JSON.parse(JSON.stringify(patch)),
      });
    }
    return { ok: true };
  });

const closeTradeSchema = z.object({
  id: z.string().uuid(),
  exit_price: z.number().positive(),
  close_reason: z.enum(["manual","stop_loss","take_profit","liquidation","expired"]).default("manual"),
});

export const closeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => closeTradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: trade, error: fetchErr } = await context.supabase
      .from("paper_trades").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (fetchErr) throw fetchErr;
    if (trade.status !== "open") throw new Error("Trade is not open");
    const sym = findSymbol(trade.symbol);
    if (!sym) throw new Error("Unknown symbol");
    const gross = computePnl(sym, trade.direction as "long"|"short", Number(trade.entry_price), data.exit_price, Number(trade.lot_size));
    const pnl = gross - Number(trade.commission ?? 0) - Number(trade.swap ?? 0);
    const rr_realized = trade.risk_amount && Number(trade.risk_amount) > 0
      ? pnl / Number(trade.risk_amount)
      : null;
    const openedAt = new Date(trade.opened_at).getTime();
    const closedAt = Date.now();
    const { error: upErr } = await context.supabase.from("paper_trades").update({
      status: "closed",
      exit_price: data.exit_price,
      pnl,
      rr_realized,
      close_reason: data.close_reason,
      closed_at: new Date(closedAt).toISOString(),
    }).eq("id", data.id).eq("user_id", context.userId);
    if (upErr) throw upErr;

    // Update account balance
    const { data: acct } = await context.supabase.from("paper_accounts")
      .select("balance").eq("id", trade.account_id).single();
    if (acct) {
      const newBal = Number(acct.balance) + pnl;
      await context.supabase.from("paper_accounts").update({ balance: newBal, equity: newBal })
        .eq("id", trade.account_id).eq("user_id", context.userId);
    }

    // Update cached stats
    const { data: stats } = await context.supabase.from("account_statistics")
      .select("*").eq("account_id", trade.account_id).maybeSingle();
    const isWin = pnl > 0, isLoss = pnl < 0;
    const total = (stats?.total_trades ?? 0) + 1;
    const wins = (stats?.wins ?? 0) + (isWin ? 1 : 0);
    const losses = (stats?.losses ?? 0) + (isLoss ? 1 : 0);
    const breakevens = (stats?.breakevens ?? 0) + (!isWin && !isLoss ? 1 : 0);
    await context.supabase.from("account_statistics").upsert({
      account_id: trade.account_id,
      user_id: context.userId,
      total_trades: total,
      wins, losses, breakevens,
      win_rate: total ? (wins / total) * 100 : 0,
      gross_profit: Number(stats?.gross_profit ?? 0) + (isWin ? pnl : 0),
      gross_loss: Number(stats?.gross_loss ?? 0) + (isLoss ? Math.abs(pnl) : 0),
      net_pnl: Number(stats?.net_pnl ?? 0) + pnl,
      best_trade: Math.max(Number(stats?.best_trade ?? 0), pnl),
      worst_trade: Math.min(Number(stats?.worst_trade ?? 0), pnl),
    });

    await context.supabase.from("position_history").insert({
      user_id: context.userId, account_id: trade.account_id, trade_id: data.id,
      event: "closed", payload: {
        exit_price: data.exit_price, pnl, close_reason: data.close_reason,
        duration_ms: closedAt - openedAt,
      },
    });
    return { ok: true, pnl, rr_realized };
  });

export const listTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    account_id: z.string().uuid().optional(),
    status: z.enum(["open","closed","cancelled"]).optional(),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("paper_trades").select("*").eq("user_id", context.userId)
      .is("deleted_at", null).order("opened_at", { ascending: false }).limit(data.limit);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const deleteTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("paper_trades")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

/* ---------------- Orders ---------------- */

const placeOrderSchema = z.object({
  account_id: z.string().uuid(),
  symbol: z.string(),
  market: z.enum(["forex","crypto","stocks","indices","futures","metals"]),
  direction: z.enum(["long","short"]),
  order_type: z.enum(["limit","stop","stop_limit"]),
  lot_size: z.number().positive(),
  trigger_price: z.number().positive(),
  limit_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => placeOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("paper_orders").insert({ ...data, user_id: context.userId, status: "pending" })
      .select().single();
    if (error) throw error;
    return created;
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("paper_orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId).eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ account_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("paper_orders").select("*").eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(200);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ---------------- Watchlists ---------------- */

export const listPaperWatchlists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [lists, symbols] = await Promise.all([
      context.supabase.from("paper_watchlists").select("*").order("sort_order"),
      context.supabase.from("paper_watchlist_symbols").select("*").order("sort_order"),
    ]);
    if (lists.error) throw lists.error;
    if (symbols.error) throw symbols.error;
    return { lists: lists.data ?? [], symbols: symbols.data ?? [] };
  });

export const createPaperWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(40),
    market: z.enum(["forex","crypto","stocks","indices","futures","metals"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase.from("paper_watchlists")
      .insert({ user_id: context.userId, name: data.name, market: data.market ?? null })
      .select().single();
    if (error) throw error;
    return created;
  });

export const deletePaperWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("paper_watchlists")
      .delete().eq("id", data.id).eq("user_id", context.userId).eq("is_default", false);
    if (error) throw error;
    return { ok: true };
  });

export const addWatchlistSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    watchlist_id: z.string().uuid(),
    symbol: z.string().min(1),
    market: z.enum(["forex","crypto","stocks","indices","futures","metals"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("paper_watchlist_symbols")
      .insert({ ...data, user_id: context.userId });
    if (error && !String(error.message).includes("duplicate")) throw error;
    return { ok: true };
  });

export const removeWatchlistSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("paper_watchlist_symbols")
      .delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleWatchlistSymbolFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_favorite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("paper_watchlist_symbols")
      .update({ is_favorite: data.is_favorite })
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------- Tags ---------------- */

export const listTradeTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("trade_tags")
      .select("*").order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createTradeTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(40),
    color: z.string().max(20).default("#22d3ee"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase.from("trade_tags")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id,name" })
      .select().single();
    if (error) throw error;
    return created;
  });

export const listTradeTagRelations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("trade_tag_relations")
      .select("trade_id, tag_id").eq("user_id", context.userId);
    if (error) throw error;
    return data ?? [];
  });

/* ---------------- Stats ---------------- */

export const getAccountStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("account_statistics")
      .select("*").eq("account_id", data.account_id).maybeSingle();
    return row ?? null;
  });

// Helper re-export to keep client-side pip math available at call sites.
export { pipsBetween };
