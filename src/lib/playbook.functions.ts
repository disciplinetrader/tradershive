import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "./server-errors";
import { computeEvolution, computePlaybookStats } from "./playbook/stats";

/* ============ Types kept internal to server module ============ */

const listSchema = z.object({
  search: z.string().optional(),
  market: z.string().optional(),
  timeframe: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  favoritesOnly: z.boolean().optional(),
  hasTradesOnly: z.boolean().optional(),
}).default({});

/* ============ Library listing ============ */

export const listPlaybookLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("strategies")
      .select("id,name,description,category,market,markets,symbols,timeframes,tags,color,icon,cover_url,status,is_favorite,updated_at,version")
      .eq("user_id", context.userId)
      .neq("status", "archived");

    if (data.favoritesOnly) query = query.eq("is_favorite", true);
    if (data.category) query = query.eq("category", data.category);
    if (data.market) query = query.contains("markets", [data.market]);
    if (data.timeframe) query = query.contains("timeframes", [data.timeframe]);
    if (data.tag) query = query.contains("tags", [data.tag]);
    if (data.search) {
      const term = data.search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }
    query = query.order("is_favorite", { ascending: false }).order("updated_at", { ascending: false });

    const { data: strategies, error } = await query;
    if (error) throw error;
    const ids = (strategies ?? []).map((s) => s.id);
    if (!ids.length) return [];

    // KPI rollup: journal + paper trades
    const [journalRes, paperRes] = await Promise.all([
      context.supabase.from("journal_entries")
        .select("id,strategy_id,pnl,rr,opened_at,closed_at")
        .eq("user_id", context.userId).in("strategy_id", ids),
      context.supabase.from("paper_trades")
        .select("id,strategy_id,pnl,rr_realized,opened_at,closed_at,status")
        .eq("user_id", context.userId).in("strategy_id", ids).eq("status", "closed"),
    ]);
    const journal = unwrap(journalRes, "listPlaybookLibrary/journal_entries") ?? [];
    const paper = unwrap(paperRes, "listPlaybookLibrary/paper_trades") ?? [];

    const bucket = new Map<string, { trades: number; wins: number; rSum: number; rCount: number }>();
    const push = (sid: string | null, pnl: number | null, r: number | null) => {
      if (!sid) return;
      const b = bucket.get(sid) ?? { trades: 0, wins: 0, rSum: 0, rCount: 0 };
      b.trades += 1;
      if ((r ?? pnl ?? 0) > 0) b.wins += 1;
      if (r != null) { b.rSum += r; b.rCount += 1; }
      bucket.set(sid, b);
    };
    journal.forEach((r) => push(r.strategy_id, r.pnl, r.rr));
    paper.forEach((r) => push(r.strategy_id, r.pnl, r.rr_realized));

    let out = (strategies ?? []).map((s) => {
      const b = bucket.get(s.id);
      return {
        ...s,
        kpi: {
          trades: b?.trades ?? 0,
          win_rate: b && b.trades ? b.wins / b.trades : 0,
          avg_r: b && b.rCount ? b.rSum / b.rCount : 0,
        },
      };
    });
    if (data.hasTradesOnly) out = out.filter((s) => s.kpi.trades > 0);
    return out;
  });

/* ============ Playbook detail ============ */

export const getPlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: strategy, error } = await context.supabase
      .from("strategies").select("*")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!strategy) throw new Error("Playbook not found");

    const [checklistsRes, itemsRes, attachmentsRes, lastRunRes] = await Promise.all([
      context.supabase.from("strategy_checklists").select("*")
        .eq("strategy_id", data.id).eq("user_id", context.userId).order("sort_order"),
      context.supabase.from("strategy_checklist_items").select("*")
        .eq("user_id", context.userId).order("sort_order"),
      context.supabase.from("strategy_attachments").select("*")
        .eq("strategy_id", data.id).eq("user_id", context.userId).order("created_at", { ascending: false }),
      context.supabase.from("strategy_checklist_runs").select("*")
        .eq("strategy_id", data.id).eq("user_id", context.userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const checklists = unwrap(checklistsRes, "getPlaybook/strategy_checklists") ?? [];
    const items = unwrap(itemsRes, "getPlaybook/strategy_checklist_items") ?? [];
    const attachments = unwrap(attachmentsRes, "getPlaybook/strategy_attachments") ?? [];
    // maybeSingle: a null row here is "no runs yet", not a failure.
    const lastRun = unwrap(lastRunRes, "getPlaybook/strategy_checklist_runs");

    const clIds = new Set(checklists.map((c) => c.id));
    const grouped = checklists.map((c) => ({
      ...c,
      items: items.filter((it) => it.checklist_id === c.id && clIds.has(it.checklist_id)),
    }));

    return {
      strategy,
      checklists: grouped,
      attachments,
      lastRun,
    };
  });

/* ============ Playbook stats ============ */

export const getPlaybookStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), rangeDays: z.number().int().positive().max(3650).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const [journalRes, paperRes] = await Promise.all([
      context.supabase.from("journal_entries")
        .select("id,symbol,direction,pnl,rr,opened_at,closed_at")
        .eq("user_id", context.userId).eq("strategy_id", data.id),
      context.supabase.from("paper_trades")
        .select("id,symbol,direction,pnl,rr_realized,opened_at,closed_at,status")
        .eq("user_id", context.userId).eq("strategy_id", data.id).eq("status", "closed"),
    ]);
    const journal = unwrap(journalRes, "getPlaybookStats/journal_entries") ?? [];
    const paper = unwrap(paperRes, "getPlaybookStats/paper_trades") ?? [];
    const raws = [
      ...journal.map((r) => ({
        id: r.id, source: "journal" as const, symbol: r.symbol, side: r.direction,
        opened_at: r.opened_at, closed_at: r.closed_at, pnl: r.pnl == null ? null : Number(r.pnl),
        r: r.rr == null ? null : Number(r.rr),
      })),
      ...paper.map((r) => ({
        id: r.id, source: "paper" as const, symbol: r.symbol, side: r.direction,
        opened_at: r.opened_at, closed_at: r.closed_at, pnl: r.pnl == null ? null : Number(r.pnl),
        r: r.rr_realized == null ? null : Number(r.rr_realized),
      })),
    ];
    return computePlaybookStats(data.id, raws);
  });

/* ============ Evolution ============ */

export const getPlaybookEvolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), rangeDays: z.number().int().positive().max(365).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const rangeDays = data.rangeDays ?? 30;
    const [journalRes, paperRes, versionsRes] = await Promise.all([
      context.supabase.from("journal_entries")
        .select("id,symbol,direction,pnl,rr,opened_at,closed_at")
        .eq("user_id", context.userId).eq("strategy_id", data.id),
      context.supabase.from("paper_trades")
        .select("id,symbol,direction,pnl,rr_realized,opened_at,closed_at,status")
        .eq("user_id", context.userId).eq("strategy_id", data.id).eq("status", "closed"),
      context.supabase.from("strategy_versions")
        .select("version,created_at,change_notes")
        .eq("user_id", context.userId).eq("strategy_id", data.id)
        .order("version", { ascending: false }).limit(10),
    ]);
    const journal = unwrap(journalRes, "getPlaybookEvolution/journal_entries") ?? [];
    const paper = unwrap(paperRes, "getPlaybookEvolution/paper_trades") ?? [];
    const versions = unwrap(versionsRes, "getPlaybookEvolution/strategy_versions") ?? [];
    const raws = [
      ...journal.map((r) => ({
        id: r.id, source: "journal" as const, symbol: r.symbol, side: r.direction,
        opened_at: r.opened_at, closed_at: r.closed_at,
        pnl: r.pnl == null ? null : Number(r.pnl),
        r: r.rr == null ? null : Number(r.rr),
      })),
      ...paper.map((r) => ({
        id: r.id, source: "paper" as const, symbol: r.symbol, side: r.direction,
        opened_at: r.opened_at, closed_at: r.closed_at,
        pnl: r.pnl == null ? null : Number(r.pnl),
        r: r.rr_realized == null ? null : Number(r.rr_realized),
      })),
    ];
    return computeEvolution(raws, versions, rangeDays);
  });

/* ============ Mutations ============ */

export const togglePlaybookFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies")
      .update({ is_favorite: data.value }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const setPlaybookMistakes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    mistakes: z.array(z.object({ id: z.string(), text: z.string().min(1).max(500) })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies")
      .update({ mistakes: data.mistakes as any }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const setChecklistRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    required_item_ids: z.array(z.string()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies")
      .update({ checklist_required_ids: data.required_item_ids })
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Checklist runs ============ */

const runItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
  checked: z.boolean(),
});

export const logChecklistRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    strategy_id: z.string().uuid(),
    context: z.enum(["paper", "replay", "journal", "manual"]).default("manual"),
    context_ref_id: z.string().uuid().nullable().optional(),
    items: z.array(runItemSchema),
    notes: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const allRequiredPassed = data.items.filter((i) => i.required).every((i) => i.checked);
    const { data: row, error } = await context.supabase.from("strategy_checklist_runs").insert({
      user_id: context.userId,
      strategy_id: data.strategy_id,
      context: data.context,
      context_ref_id: data.context_ref_id ?? null,
      items: data.items as any,
      all_required_passed: allRequiredPassed,
      notes: data.notes ?? null,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const listChecklistRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ strategy_id: z.string().uuid(), limit: z.number().int().positive().max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("strategy_checklist_runs").select("*")
      .eq("user_id", context.userId).eq("strategy_id", data.strategy_id)
      .order("created_at", { ascending: false }).limit(data.limit ?? 20);
    if (error) throw error;
    return rows ?? [];
  });
