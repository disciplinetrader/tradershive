import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const battleTypeSchema = z.enum(["1v1", "2v2", "ffa5", "ffa10"]);
const marketSchema = z.enum(["crypto", "forex", "indices", "metals", "mixed"]);
const winCondSchema = z.enum([
  "highest_pnl", "highest_r", "highest_winrate", "lowest_dd",
  "first_to_5r", "first_to_target", "consistency",
]);
const visibilitySchema = z.enum(["public", "private"]);

function randomCode(len = 8) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const MAX_PARTICIPANTS: Record<string, number> = { "1v1": 2, "2v2": 4, ffa5: 5, ffa10: 10 };

/* ================= List ================= */

const listScopeSchema = z.object({
  scope: z.enum(["featured", "live", "upcoming", "mine", "history", "all"]).default("all"),
  limit: z.number().int().positive().max(100).default(24),
});

export const listBattles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listScopeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("battles").select("*").limit(data.limit);
    switch (data.scope) {
      case "featured":
        q = q.eq("featured", true).in("status", ["upcoming", "live"]).order("start_at", { ascending: true });
        break;
      case "live":
        q = q.eq("status", "live").order("end_at", { ascending: true });
        break;
      case "upcoming":
        q = q.eq("status", "upcoming").order("start_at", { ascending: true });
        break;
      case "history":
        q = q.eq("status", "completed").order("end_at", { ascending: false });
        break;
      case "mine": {
        const { data: parts } = await supabase.from("battle_participants").select("battle_id").eq("user_id", userId);
        const ids = (parts ?? []).map((p) => p.battle_id);
        if (ids.length === 0) return [];
        q = q.in("id", ids).order("start_at", { ascending: false });
        break;
      }
      default:
        q = q.order("start_at", { ascending: false });
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ================= Get one ================= */

export const getBattle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: battle, error: e1 }, participantsRes, rankingsRes, resultsRes] = await Promise.all([
      supabase.from("battles").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("battle_participants").select("*").eq("battle_id", data.id),
      supabase.from("battle_rankings").select("*").eq("battle_id", data.id).order("rank", { ascending: true }),
      supabase.from("battle_results").select("*").eq("battle_id", data.id).order("final_rank", { ascending: true }),
    ]);
    if (e1) throw e1;
    if (!battle) throw new Error("Battle not found");
    const userIds = Array.from(new Set([
      ...(participantsRes.data ?? []).map((p) => p.user_id),
      battle.host_id,
    ]));
    const { data: profiles } = await supabase
      .from("profiles").select("id, username, display_name, avatar_url, country").in("id", userIds);
    return {
      battle,
      participants: participantsRes.data ?? [],
      rankings: rankingsRes.data ?? [],
      results: resultsRes.data ?? [],
      profiles: profiles ?? [],
      isHost: battle.host_id === userId,
      isParticipant: (participantsRes.data ?? []).some((p) => p.user_id === userId),
    };
  });

/* ================= Create ================= */

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  visibility: visibilitySchema.default("public"),
  battle_type: battleTypeSchema,
  market: marketSchema,
  allowed_symbols: z.array(z.string().min(1)).max(30),
  starting_balance: z.number().positive().max(1_000_000).default(10000),
  max_risk_pct: z.number().positive().max(20).default(2),
  max_daily_loss_pct: z.number().positive().max(50).default(5),
  max_drawdown_pct: z.number().positive().max(80).default(10),
  max_trades: z.number().int().positive().max(500).nullable().optional(),
  win_condition: winCondSchema,
  target_value: z.number().nullable().optional(),
  start_at: z.string(),
  end_at: z.string(),
  timezone: z.string().default("UTC"),
});

export const createBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const start = new Date(data.start_at);
    const end = new Date(data.end_at);
    if (!(start < end)) throw new Error("End time must be after start time");
    if (end.getTime() - start.getTime() < 5 * 60 * 1000) throw new Error("Battle must be at least 5 minutes long");
    if (data.allowed_symbols.length === 0) throw new Error("Pick at least one symbol");

    const invite = data.visibility === "private" ? randomCode(8) : null;
    const max = MAX_PARTICIPANTS[data.battle_type] ?? 10;
    const status = start.getTime() <= Date.now() ? "live" : "upcoming";

    const { data: battle, error } = await context.supabase
      .from("battles")
      .insert({
        host_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        visibility: data.visibility,
        invite_code: invite,
        battle_type: data.battle_type,
        market: data.market,
        allowed_symbols: data.allowed_symbols,
        starting_balance: data.starting_balance,
        max_risk_pct: data.max_risk_pct,
        max_daily_loss_pct: data.max_daily_loss_pct,
        max_drawdown_pct: data.max_drawdown_pct,
        max_trades: data.max_trades ?? null,
        win_condition: data.win_condition,
        target_value: data.target_value ?? null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        timezone: data.timezone,
        status,
        max_participants: max,
      })
      .select()
      .single();
    if (error) throw error;

    // Host auto-joins.
    await context.supabase.rpc("join_battle", { _battle_id: battle.id });
    return battle;
  });

/* ================= Join / Leave / Cancel ================= */

export const joinBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("join_battle", { _battle_id: data.battleId });
    if (error) throw error;
    return { battleId: id as string };
  });

export const joinByInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().min(4).max(16) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("join_battle_by_code", { _code: data.code.toUpperCase() });
    if (error) throw error;
    return { battleId: id as string };
  });

export const leaveBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: battle } = await context.supabase.from("battles").select("status").eq("id", data.battleId).maybeSingle();
    if (!battle) throw new Error("Battle not found");
    if (!["draft", "upcoming"].includes(battle.status)) throw new Error("Battle already started");
    const { error } = await context.supabase
      .from("battle_participants")
      .delete()
      .eq("battle_id", data.battleId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const cancelBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("battles")
      .update({ status: "cancelled" })
      .eq("id", data.battleId)
      .eq("host_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ================= Tick / Finalize ================= */

export const tickBattles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("tick_battles");
    if (error) throw error;
    return { ok: true };
  });

export const finalizeBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: battle } = await context.supabase
      .from("battles").select("host_id, end_at").eq("id", data.battleId).maybeSingle();
    if (!battle) throw new Error("Battle not found");
    if (battle.host_id !== context.userId) {
      // still allow if end passed
      if (new Date(battle.end_at) > new Date()) throw new Error("Only the host may finalize before end time");
    }
    const { error } = await context.supabase.rpc("finalize_battle", { _battle_id: data.battleId });
    if (error) throw error;
    return { ok: true };
  });

/* ================= My battle stats ================= */

export const listMyBattleStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: results } = await supabase
      .from("battle_results")
      .select("battle_id, final_rank, pnl, xp_awarded, coins_awarded")
      .eq("user_id", userId);
    const total = results?.length ?? 0;
    const wins = (results ?? []).filter((r) => r.final_rank === 1).length;
    const avgFinish = total > 0
      ? Math.round(((results ?? []).reduce((s, r) => s + (r.final_rank || 0), 0) / total) * 10) / 10
      : 0;
    const totalPnl = (results ?? []).reduce((s, r) => s + Number(r.pnl || 0), 0);
    const xp = (results ?? []).reduce((s, r) => s + (r.xp_awarded || 0), 0);
    const coins = (results ?? []).reduce((s, r) => s + (r.coins_awarded || 0), 0);
    return { total, wins, losses: total - wins, winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0, avgFinish, totalPnl, xp, coins };
  });

/* ================= Battle history detail ================= */

export const getBattleHistoryDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: battle }, resultsRes, tradesRes, logsRes] = await Promise.all([
      supabase.from("battles").select("*").eq("id", data.battleId).maybeSingle(),
      supabase.from("battle_results").select("*").eq("battle_id", data.battleId).order("final_rank", { ascending: true }),
      supabase.from("paper_trades").select("id,user_id,symbol,direction,pnl,rr_realized,opened_at,closed_at")
        .eq("battle_id", data.battleId).eq("status", "closed").order("closed_at", { ascending: true }),
      supabase.from("battle_logs").select("*").eq("battle_id", data.battleId).order("created_at", { ascending: false }).limit(50),
    ]);
    const userIds = Array.from(new Set([...(resultsRes.data ?? []).map((r) => r.user_id), ...(tradesRes.data ?? []).map((t) => t.user_id)]));
    const { data: profiles } = await supabase
      .from("profiles").select("id, username, display_name, avatar_url").in("id", userIds);
    return { battle, results: resultsRes.data ?? [], trades: tradesRes.data ?? [], logs: logsRes.data ?? [], profiles: profiles ?? [] };
  });

/* ================= Notifications ================= */

export const listBattleNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("battle_notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });

export const markBattleNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("battle_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

/* ================= Templates ================= */

export const listBattleTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("battle_templates").select("*")
      .order("is_official", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
