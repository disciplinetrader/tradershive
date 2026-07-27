import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnalyticsTrade } from "./statistics/types";
import { inferSession } from "./statistics/session";

/**
 * Statistics data source.
 * Returns closed paper_trades merged with any matching journal_entry
 * (so setup/strategy/emotions/session/mistakes are included).
 */
export const getAnalyticsDataset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [tradesRes, journalRes, accountsRes] = await Promise.all([
      context.supabase
        .from("paper_trades")
        .select("id, account_id, symbol, market, direction, entry_price, exit_price, stop_loss, take_profit, lot_size, rr_planned, rr_realized, pnl, commission, swap, opened_at, closed_at")
        .is("deleted_at", null)
        .order("opened_at", { ascending: false })
        .limit(5000),
      context.supabase
        .from("journal_entries")
        .select("trade_id, session, setup, strategy, grade, emotions, mistakes, risk_pct, rr, duration_seconds, status, id, symbol, market, direction, pnl, opened_at, closed_at, entry_price, exit_price, stop_loss, take_profit, lot_size, commission, swap")
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(5000),
      context.supabase
        .from("paper_accounts")
        .select("id, name, currency, starting_balance, balance, equity, is_archived")
        .is("deleted_at", null),
    ]);
    if (tradesRes.error) throw tradesRes.error;
    if (journalRes.error) throw journalRes.error;
    if (accountsRes.error) throw accountsRes.error;

    const journalByTrade = new Map<string, any>();
    const standaloneJournal: any[] = [];
    for (const j of journalRes.data ?? []) {
      if (j.trade_id) journalByTrade.set(j.trade_id, j);
      else standaloneJournal.push(j);
    }

    const trades: AnalyticsTrade[] = [];
    for (const t of tradesRes.data ?? []) {
      const j = journalByTrade.get(t.id);
      trades.push({
        source: "paper",
        id: t.id,
        trade_id: t.id,
        account_id: t.account_id,
        symbol: t.symbol,
        market: String(t.market),
        direction: t.direction as "long" | "short",
        entry_price: t.entry_price != null ? Number(t.entry_price) : null,
        exit_price: t.exit_price != null ? Number(t.exit_price) : null,
        stop_loss: t.stop_loss != null ? Number(t.stop_loss) : null,
        take_profit: t.take_profit != null ? Number(t.take_profit) : null,
        lot_size: t.lot_size != null ? Number(t.lot_size) : null,
        rr: t.rr_realized != null ? Number(t.rr_realized) : t.rr_planned != null ? Number(t.rr_planned) : (j?.rr != null ? Number(j.rr) : null),
        risk_pct: j?.risk_pct != null ? Number(j.risk_pct) : null,
        pnl: t.pnl != null ? Number(t.pnl) : 0,
        commission: t.commission != null ? Number(t.commission) : 0,
        swap: t.swap != null ? Number(t.swap) : 0,
        opened_at: t.opened_at,
        closed_at: t.closed_at,
        duration_seconds: (t.opened_at && t.closed_at)
          ? Math.max(0, Math.floor((new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000))
          : (j?.duration_seconds ?? null),
        session: j?.session ?? inferSession(t.opened_at),
        setup: j?.setup ?? null,
        strategy: j?.strategy ?? null,
        emotions: (j?.emotions ?? []) as string[],
        mistakes: (j?.mistakes ?? []) as string[],
        grade: j?.grade ?? null,
        status: "closed",
      });
    }
    // Standalone journal entries (manual imports without paper trade)
    for (const j of standaloneJournal) {
      if (!j.closed_at) continue;
      trades.push({
        id: j.id,
        trade_id: null,
        account_id: null,
        symbol: j.symbol ?? "—",
        market: j.market ?? "other",
        direction: (j.direction as "long" | "short") ?? "long",
        entry_price: j.entry_price != null ? Number(j.entry_price) : null,
        exit_price: j.exit_price != null ? Number(j.exit_price) : null,
        stop_loss: j.stop_loss != null ? Number(j.stop_loss) : null,
        take_profit: j.take_profit != null ? Number(j.take_profit) : null,
        lot_size: j.lot_size != null ? Number(j.lot_size) : null,
        rr: j.rr != null ? Number(j.rr) : null,
        risk_pct: j.risk_pct != null ? Number(j.risk_pct) : null,
        pnl: j.pnl != null ? Number(j.pnl) : 0,
        commission: j.commission != null ? Number(j.commission) : 0,
        swap: j.swap != null ? Number(j.swap) : 0,
        opened_at: j.opened_at ?? j.closed_at,
        closed_at: j.closed_at,
        duration_seconds: j.duration_seconds ?? null,
        session: j.session ?? inferSession(j.opened_at ?? j.closed_at),
        setup: j.setup ?? null,
        strategy: j.strategy ?? null,
        emotions: (j.emotions ?? []) as string[],
        mistakes: (j.mistakes ?? []) as string[],
        grade: j.grade ?? null,
        status: "closed",
      });
    }

    return {
      trades,
      accounts: accountsRes.data ?? [],
      generatedAt: new Date().toISOString(),
    };
  });

/* ---------------- Goals ---------------- */

const goalKindEnum = z.enum(["net_profit","max_drawdown","min_win_rate","min_rr","max_trades","trades_count"]);
const periodEnum = z.enum(["day","week","month","quarter","year","all_time","custom"]);

export const listGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("goal_tracking")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      kind: goalKindEnum,
      target_value: z.number(),
      period: periodEnum.default("month"),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("goal_tracking")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(80).optional(),
      target_value: z.number().optional(),
      period: periodEnum.optional(),
      active: z.boolean().optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("goal_tracking")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("goal_tracking")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------- Saved filters ---------------- */

export const listSavedFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("statistics_saved_filters")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(60),
      filters: z.record(z.string(), z.unknown()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("statistics_saved_filters")
      .insert({ name: data.name, filters: data.filters as any, user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("statistics_saved_filters")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
