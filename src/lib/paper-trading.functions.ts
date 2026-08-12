import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findSymbol } from "./paper-trading/symbols";
import { pnl as computePnl, pipsBetween } from "./paper-trading/calculations";
import { validateNewOrder, type OpenTradeInput } from "./paper-trading/risk";

/* ---------------- Accounts ---------------- */

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: acct, error } = await context.supabase
      .from("paper_accounts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw error;
    return acct;
  });

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
        margin_call_level: z.number().min(0).max(1000).optional(),
        stop_out_level: z.number().min(0).max(1000).optional(),
        negative_balance_protection: z.boolean().optional(),
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

    // ---- Broker-style pre-flight validation (hard gate) ----
    const [{ data: acct, error: acctErr }, { data: opens }] = await Promise.all([
      context.supabase
        .from("paper_accounts")
        .select("id, balance, equity, leverage, currency, max_trade_risk_pct, margin_call_level, stop_out_level, negative_balance_protection, is_archived, deleted_at")
        .eq("id", data.account_id).eq("user_id", context.userId).single(),
      context.supabase
        .from("paper_trades")
        .select("id, symbol, direction, entry_price, lot_size")
        .eq("account_id", data.account_id).eq("user_id", context.userId)
        .eq("status", "open").is("deleted_at", null),
    ]);
    if (acctErr || !acct) throw new Error("Account not found");
    if (acct.is_archived || acct.deleted_at) throw new Error("Account is archived");

    // Fetch a fresh quote for the validation if it's a market order
    let livePrice: number | null = null;
    if (data.order_type === "market") {
      try {
        const { twelveDataQuote } = await import("./market-data/twelvedata.functions");
        const qRes = await twelveDataQuote({ data: { symbols: [data.symbol] } });
        if (qRes.quotes?.[0]) livePrice = qRes.quotes[0].last;
      } catch (e) {
        console.warn("[openTrade] could not fetch live quote for validation:", e);
      }
    }

    const validation = validateNewOrder(
      acct as any,
      (opens ?? []) as OpenTradeInput[],
      {
        symbol: data.symbol,
        direction: data.direction,
        entry_price: Number(data.entry_price),
        lot_size: Number(data.lot_size),
        stop_loss: data.stop_loss ?? null,
        risk_amount: data.risk_amount ?? null,
      },
      () => livePrice
    );
    
    if (!validation.ok) {
      throw new Error(validation.errors.join(" · "));
    }

    const { data: created, error } = await context.supabase
      .from("paper_trades")
      .insert({ 
        ...trade, 
        user_id: context.userId, 
        status: "open", 
        opened_at: new Date().toISOString(),
        entry_price: data.order_type === "market" && livePrice ? livePrice : data.entry_price
      })
      .select()
      .single();
    if (error) throw error;
    // Tags are chosen at entry — before the outcome is known, which is the
    // honest moment to record intent — but `journal_entry_tags` needs an
    // entry_id that only exists once the trade closes and
    // `create_journal_draft_from_trade()` fires. `tag_ids` is the staging
    // buffer that trigger drains; it is not a second tag system.
    if (tag_ids?.length) {
      const { error: tagErr } = await context.supabase
        .from("paper_trades")
        .update({ tag_ids })
        .eq("id", created.id)
        .eq("user_id", context.userId);
      if (tagErr) throw tagErr;
    }
    await context.supabase.from("position_history").insert({
      user_id: context.userId, account_id: data.account_id, trade_id: created.id,
      event: "opened", payload: {
        entry_price: created.entry_price, lot_size: data.lot_size,
        required_margin: validation.required_margin, liq_price: validation.liq_price,
      },
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
  close_reason: z.enum(["manual","stop_loss","take_profit","liquidation","stop_out","expired"]).default("manual"),
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
    let pnl = gross - Number(trade.commission ?? 0) - Number(trade.swap ?? 0);

    // Fetch the account BEFORE writing the trade so we can bound the
    // realized loss under negative-balance-protection. Bounding here (not
    // just at balance-update time) keeps `paper_trades.pnl`,
    // `account_statistics.net_pnl` and `paper_accounts.balance` internally
    // consistent — the invariant that closed a $70M drift on a $25k account.
    const { data: acct } = await context.supabase.from("paper_accounts")
      .select("balance, negative_balance_protection").eq("id", trade.account_id).single();

    let closeReason = data.close_reason;
    if (acct?.negative_balance_protection) {
      const balance = Number(acct.balance);
      if (balance + pnl < 0) {
        // Cap the loss so post-close balance floors at $0 (broker NBP).
        pnl = -balance;
        if (closeReason === "manual") closeReason = "liquidation";
      }
    }

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
      close_reason: closeReason,
      closed_at: new Date(closedAt).toISOString(),
    }).eq("id", data.id).eq("user_id", context.userId);
    if (upErr) throw upErr;

    if (acct) {
      const newBal = Number(acct.balance) + pnl;
      // pnl is already NBP-bounded above; the max(0, …) is belt-and-braces
      // for legacy accounts still carrying a stale balance value.
      const safeBal = acct.negative_balance_protection ? Math.max(0, newBal) : newBal;
      await context.supabase.from("paper_accounts").update({ balance: safeBal, equity: safeBal })
        .eq("id", trade.account_id).eq("user_id", context.userId);
    }

    // Update cached stats (net_pnl now matches balance movement exactly).
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
        exit_price: data.exit_price, pnl, close_reason: closeReason,
        duration_ms: closedAt - openedAt,
      },
    });
    return { ok: true, pnl, rr_realized, close_reason: closeReason };
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

const modifyOrderSchema = z.object({
  id: z.string().uuid(),
  trigger_price: z.number().positive().optional(),
  limit_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  lot_size: z.number().positive().optional(),
});

/**
 * Modify a pending order's trigger / limit / SL / TP / size. Drag-and-drop
 * from the chart lands here. Only mutates rows in `pending` status.
 */
export const modifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => modifyOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("paper_orders")
      .update(patch).eq("id", id).eq("user_id", context.userId).eq("status", "pending");
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

/**
 * The trade tag pickers read the one journal dictionary. `trade_tags` and
 * `trade_tag_relations` are retired — a tag chosen at entry is the same tag
 * the journal will slice analytics by, so there is nothing to keep separate.
 */
export const listTradeTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("journal_tags")
      .select("*").eq("user_id", context.userId).order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createTradeTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(40),
    kind: z.enum(["setup", "mistake", "emotion", "custom"]).default("setup"),
    color: z.string().max(20).default("#22d3ee"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const value = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const { data: created, error } = await context.supabase.from("journal_tags")
      .upsert(
        { user_id: context.userId, kind: data.kind, value, name: data.name, color: data.color },
        { onConflict: "user_id,kind,value" },
      )
      .select().single();
    if (error) throw error;
    return created;
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

/* ---------------- Pro trade management ---------------- */

/**
 * Partial close — reduce lot_size on an open position by a fraction (0–1),
 * booking P/L for the closed slice and leaving the rest running with the
 * original entry/SL/TP. Emits `partial_close` into position_history.
 */
export const partialCloseTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      fraction: z.number().gt(0).lt(1),
      exit_price: z.number().positive(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: trade, error: fetchErr } = await context.supabase
      .from("paper_trades").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (fetchErr) throw fetchErr;
    if (trade.status !== "open") throw new Error("Trade is not open");
    const sym = findSymbol(trade.symbol);
    if (!sym) throw new Error("Unknown symbol");

    const originalLot = Number(trade.lot_size);
    const closedLot = Math.max(sym.minLot, Number((originalLot * data.fraction).toFixed(4)));
    const remainingLot = Number((originalLot - closedLot).toFixed(4));
    if (remainingLot < sym.minLot) throw new Error("Remaining size would be below symbol minimum — close fully instead");

    const gross = computePnl(sym, trade.direction as "long"|"short", Number(trade.entry_price), data.exit_price, closedLot);
    const commissionShare = Number(trade.commission ?? 0) * data.fraction;
    const swapShare = Number(trade.swap ?? 0) * data.fraction;
    let pnl = gross - commissionShare - swapShare;

    const { data: acct } = await context.supabase.from("paper_accounts")
      .select("balance, negative_balance_protection").eq("id", trade.account_id).single();

    // Bound realized loss under NBP before writing anywhere — keeps stats
    // consistent with the actual balance movement.
    if (acct?.negative_balance_protection) {
      const balance = Number(acct.balance);
      if (balance + pnl < 0) pnl = -balance;
    }

    const { error: upErr } = await context.supabase.from("paper_trades").update({
      lot_size: remainingLot,
      commission: Number(trade.commission ?? 0) - commissionShare,
      swap: Number(trade.swap ?? 0) - swapShare,
    }).eq("id", data.id).eq("user_id", context.userId);
    if (upErr) throw upErr;

    if (acct) {
      const raw = Number(acct.balance) + pnl;
      const newBal = acct.negative_balance_protection ? Math.max(0, raw) : raw;
      await context.supabase.from("paper_accounts")
        .update({ balance: newBal, equity: newBal })
        .eq("id", trade.account_id).eq("user_id", context.userId);
    }

    await context.supabase.from("position_history").insert({
      user_id: context.userId, account_id: trade.account_id, trade_id: data.id,
      event: "partial_close",
      payload: { fraction: data.fraction, closed_lot: closedLot, remaining_lot: remainingLot, exit_price: data.exit_price, pnl },
    });
    return { ok: true, pnl, closed_lot: closedLot, remaining_lot: remainingLot };
  });

/** Move stop-loss to entry (break-even). Idempotent. */
export const moveToBreakEven = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: trade, error } = await context.supabase
      .from("paper_trades").select("id, entry_price, stop_loss, account_id, status")
      .eq("id", data.id).eq("user_id", context.userId).single();
    if (error) throw error;
    if (trade.status !== "open") throw new Error("Trade is not open");
    const entry = Number(trade.entry_price);
    const changed = Number(trade.stop_loss ?? NaN) !== entry;
    if (changed) {
      const { error: upErr } = await context.supabase.from("paper_trades")
        .update({ stop_loss: entry }).eq("id", data.id).eq("user_id", context.userId);
      if (upErr) throw upErr;
      await context.supabase.from("position_history").insert({
        user_id: context.userId, account_id: trade.account_id, trade_id: data.id,
        event: "break_even", payload: { stop_loss: entry },
      });
    }
    return { ok: true, changed };
  });

/** Append a timestamped note to an open/closed trade. */
export const addTradeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    note: z.string().trim().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: trade, error } = await context.supabase
      .from("paper_trades").select("notes, account_id")
      .eq("id", data.id).eq("user_id", context.userId).single();
    if (error) throw error;
    const stamp = new Date().toISOString();
    const line = `[${stamp}] ${data.note}`;
    const next = trade.notes ? `${trade.notes}\n${line}` : line;
    const { error: upErr } = await context.supabase.from("paper_trades")
      .update({ notes: next }).eq("id", data.id).eq("user_id", context.userId);
    if (upErr) throw upErr;
    await context.supabase.from("position_history").insert({
      user_id: context.userId, account_id: trade.account_id, trade_id: data.id,
      event: "note_added", payload: { note: data.note },
    });
    return { ok: true, notes: next };
  });

/** Ordered event timeline for a single trade. */
export const listTradeTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trade_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("position_history")
      .select("id, event, payload, created_at")
      .eq("user_id", context.userId)
      .eq("trade_id", data.trade_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

/* ---------------- Exit ladder (multiple TP/SL levels) ---------------- */

/**
 * Staged exits live in `paper_trade_exits`, never in `paper_trades`.
 *
 * `paper_trades.stop_loss` / `.take_profit` keep meaning "the primary level"
 * and are deliberately left alone: `create_journal_draft_from_trade()` copies
 * them straight into `journal_entries`, and the CSV importer and journal
 * validation both read them as scalars. A trade with no ladder has no rows
 * here and behaves exactly as it did before this table existed.
 *
 * `percent` is a share of the ORIGINAL lot size, so allocations stay stable as
 * the position is scaled out — TP2 at 50% always means half the original size,
 * never half of whatever survived TP1. Same rule as `chart/orders/take-profit.ts`.
 */
const exitLegSchema = z.object({
  kind: z.enum(["take_profit", "stop_loss"]).default("take_profit"),
  idx: z.number().int().min(1),
  price: z.number().positive(),
  percent: z.number().positive().max(100),
  action: z.enum(["none", "break_even", "trail"]).default("none"),
});

const setTradeExitsSchema = z.object({
  trade_id: z.string().uuid(),
  legs: z.array(exitLegSchema).max(10),
});

/**
 * Replace a trade's ladder wholesale.
 *
 * Delete-then-insert rather than a diff: the ladder is small, it is always
 * edited as a unit, and a partial diff failure would leave a ladder whose
 * allocations no longer sum to something meaningful. Only `pending` legs are
 * cleared — a leg that already filled is execution history and rewriting it
 * would falsify the trade.
 */
export const setTradeExits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setTradeExitsSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Ownership is enforced by RLS, but checking here turns a silent no-op
    // into an error the ticket can actually show.
    const { data: trade, error: tradeErr } = await context.supabase
      .from("paper_trades")
      .select("id, account_id, lot_size")
      .eq("id", data.trade_id).eq("user_id", context.userId).single();
    if (tradeErr || !trade) throw new Error("Trade not found");

    const allocated = data.legs
      .filter((l) => l.kind === "take_profit")
      .reduce((sum, l) => sum + l.percent, 0);
    if (allocated > 100.0001) {
      throw new Error("Take-profit allocation exceeds 100% of the position");
    }
    const slots = new Set(data.legs.map((l) => `${l.kind}:${l.idx}`));
    if (slots.size !== data.legs.length) {
      throw new Error("Two exit levels share the same ladder slot");
    }

    const { error: delErr } = await context.supabase
      .from("paper_trade_exits")
      .delete()
      .eq("trade_id", data.trade_id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (delErr) throw delErr;

    if (data.legs.length) {
      const { error: insErr } = await context.supabase
        .from("paper_trade_exits")
        .insert(data.legs.map((l) => ({ ...l, trade_id: data.trade_id, user_id: context.userId })));
      if (insErr) throw insErr;

      await context.supabase.from("position_history").insert({
        user_id: context.userId, account_id: trade.account_id, trade_id: data.trade_id,
        event: "modified",
        payload: { exits: data.legs.map((l) => ({ kind: l.kind, idx: l.idx, price: l.price, percent: l.percent, action: l.action })) },
      });
    }
    return { ok: true, count: data.legs.length };
  });

/**
 * Exits for several trades at once — what the chart overlay needs.
 *
 * One request for every open position on the symbol rather than one per
 * position: the overlay re-renders on every tick, and N queries behind a
 * 4s poll is a lot of traffic for a handful of rows.
 */
export const listExitsForTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trade_ids: z.array(z.string().uuid()).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.trade_ids.length) return [];
    const { data: rows, error } = await context.supabase
      .from("paper_trade_exits")
      .select("id, trade_id, kind, idx, price, percent, action, status, filled_at, filled_price")
      .eq("user_id", context.userId)
      .in("trade_id", data.trade_ids)
      .order("idx", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

/**
 * Re-price a single pending leg.
 *
 * Exists so dragging the primary target on the chart can keep leg 1 in step
 * with `paper_trades.take_profit`. Without it the two silently diverge: the
 * drag writes the scalar column and the ladder row keeps the old price, which
 * is invisible on screen and wrong in the table any future report reads.
 * A filled leg is execution history and is not re-priceable.
 */
export const updateExitLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), price: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("paper_trade_exits")
      .update({ price: data.price, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });

export const listTradeExits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trade_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("paper_trade_exits")
      .select("id, trade_id, kind, idx, price, percent, action, status, filled_at, filled_price")
      .eq("user_id", context.userId)
      .eq("trade_id", data.trade_id)
      .order("idx", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// Helper re-export to keep client-side pip math available at call sites.
export { pipsBetween };
