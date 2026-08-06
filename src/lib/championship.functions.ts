import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Errors, AppError } from "@/lib/server-errors";

/* ============ LIST / GET ============ */

export const listChampionships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["current", "next", "past", "all", "mine"]).default("all"),
        limit: z.number().int().positive().max(50).default(24),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("championships").select("*").limit(data.limit);
    switch (data.scope) {
      case "current":
        q = q.in("status", ["live", "registration", "upcoming"]).order("start_at", { ascending: true });
        break;
      case "next":
        q = q.eq("status", "upcoming").order("start_at", { ascending: true });
        break;
      case "past":
        q = q.eq("status", "completed").order("end_at", { ascending: false });
        break;
      case "mine": {
        const { data: p } = await supabase.from("championship_participants").select("championship_id").eq("user_id", userId);
        const ids = (p ?? []).map((r: any) => r.championship_id);
        if (!ids.length) return [];
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

export const getChampionship = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: champ, error } = await supabase.from("championships").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!champ) throw new Error("Championship not found");
    const [reg, part, rankings, activity, hof] = await Promise.all([
      supabase
        .from("championship_registrations")
        .select("*")
        .eq("championship_id", data.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("championship_participants")
        .select("*")
        .eq("championship_id", data.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("championship_rankings")
        .select("*")
        .eq("championship_id", data.id)
        .order("rank", { ascending: true, nullsFirst: false })
        .limit(500),
      supabase
        .from("championship_activity")
        .select("*")
        .eq("championship_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("championship_hall_of_fame").select("*").eq("championship_id", data.id).maybeSingle(),
    ]);
    const userIds = Array.from(
      new Set(
        [
          ...((rankings.data as any[]) ?? []).map((r) => r.user_id),
          hof.data?.champion_user_id,
          hof.data?.runner_up_user_id,
          hof.data?.third_user_id,
        ].filter(Boolean) as string[],
      ),
    );
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, country").in("id", userIds)
      : { data: [] };
    // Participant rows are owner/admin-scoped by RLS; use the definer-backed
    // counter so the public count stays available without exposing rows.
    const participantCount = await supabase.rpc("championship_participant_count" as any, {
      _champ: data.id,
    });

    return {
      championship: champ,
      my_registration: reg.data ?? null,
      my_participant: part.data ?? null,
      rankings: rankings.data ?? [],
      activity: activity.data ?? [],
      hall_of_fame: hof.data ?? null,
      profiles: profiles ?? [],
      participant_count: (participantCount.data as number | null) ?? 0,
    };
  });

/* ============ REGISTER / CANCEL ============ */

export const registerChampionship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ championship_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Server-authoritative: never register for an ended/cancelled tournament.
    const { data: champ, error: cErr } = await supabase
      .from("championships").select("status, end_at").eq("id", data.championship_id).single();
    if (cErr || !champ) throw new Error("Championship not found");
    const nowIso = new Date().toISOString();
    if (
      champ.status === "completed" || champ.status === "cancelled" || champ.status === "grading" ||
      (champ.end_at && nowIso > champ.end_at)
    ) {
      throw new Error("This championship has already ended — registration is closed.");
    }
    const { error } = await supabase.rpc("register_for_championship" as any, { _champ: data.championship_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Open-join for a live tournament — provisions a $10k paper account tied to the championship. */
export const joinChampionshipLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ championship_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // Server-authoritative status check
    const { data: champ, error: cErr } = await supabase.from("championships").select("status, end_at").eq("id", data.championship_id).single();
    if (cErr || !champ) throw new Error("Championship not found");
    
    const now = new Date().toISOString();
    if (champ.status === "completed" || champ.status === "cancelled" || (champ.end_at && now > champ.end_at)) {
      throw new Error("This championship has already ended.");
    }

    const { data: rows, error } = await supabase.rpc("join_championship_live" as any, { _champ: data.championship_id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      ok: true,
      registration_id: row?.registration_id as string,
      participant_id: row?.participant_id as string,
      paper_account_id: row?.paper_account_id as string,
    };
  });

export const cancelChampionshipRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ championship_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("cancel_championship_registration" as any, { _champ: data.championship_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ HALL OF FAME ============ */

export const listHallOfFame = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("championship_hall_of_fame")
      .select("*, championships!inner(id, name, slug, season_year, season_month, end_at, banner_url)")
      .order("finalized_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    const uids = Array.from(
      new Set(
        (data ?? [])
          .flatMap((r: any) => [r.champion_user_id, r.runner_up_user_id, r.third_user_id])
          .filter(Boolean) as string[],
      ),
    );
    const { data: profiles } = uids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, country").in("id", uids)
      : { data: [] };
    return { entries: data ?? [], profiles: profiles ?? [] };
  });

/* ============ PROFILE INTEGRATION ============ */

export const getUserChampionshipProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const uid = data.user_id ?? context.userId;
    const { supabase } = context;
    const [rating, results] = await Promise.all([
      supabase.from("championship_rating").select("*").eq("user_id", uid).maybeSingle(),
      supabase
        .from("championship_results")
        .select("*, championships!inner(id, name, slug, season_year, season_month)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);
    return { rating: rating.data ?? null, results: results.data ?? [] };
  });

/* ============ ADMIN ============ */

const adminGuard = async (context: any) => {
  const { data } = await context.supabase.rpc("is_platform_admin", { _user_id: context.userId });
  if (!data) throw new Error("Forbidden");
};

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().nullish(),
  banner_url: z.string().url().nullish(),
  season_year: z.number().int(),
  season_month: z.number().int().min(1).max(12),
  starting_balance: z.number().positive(),
  max_daily_loss_pct: z.number().min(0),
  max_drawdown_pct: z.number().min(0),
  max_risk_per_trade_pct: z.number().min(0),
  allowed_markets: z.array(z.string()),
  allowed_symbols: z.array(z.string()).default([]),
  allowed_sessions: z.array(z.string()).default([]),
  min_trades: z.number().int().min(0),
  win_condition: z.enum(["highest_pnl", "highest_r", "highest_winrate", "lowest_dd", "profit_factor", "consistency", "composite"]),
  prize_info: z.record(z.any()).default({}),
  registration_opens_at: z.string(),
  registration_closes_at: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  is_featured: z.boolean().default(false),
});

export const upsertChampionship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await adminGuard(context);
    const slug = `${data.season_year}-${String(data.season_month).padStart(2, "0")}-championship`;
    const payload = { ...data, slug, created_by: context.userId };
    const { data: row, error } = data.id
      ? await context.supabase.from("championships").update(payload).eq("id", data.id).select("*").single()
      : await context.supabase.from("championships").insert(payload).select("*").single();
    if (error) throw error;
    return row;
  });

export const adminChampionshipAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        championship_id: z.string().uuid(),
        action: z.enum(["start", "finalize", "cancel", "pause", "tick"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await adminGuard(context);
    const { supabase } = context;
    if (data.action === "start") {
      const { error } = await supabase.rpc("start_championship" as any, { _champ: data.championship_id });
      if (error) throw new Error(error.message);
    } else if (data.action === "finalize") {
      const { error } = await supabase.rpc("finalize_championship" as any, { _champ: data.championship_id });
      if (error) throw new Error(error.message);
    } else if (data.action === "cancel") {
      const { error } = await supabase.from("championships").update({ status: "cancelled" }).eq("id", data.championship_id);
      if (error) throw error;
    } else if (data.action === "pause") {
      const { error } = await supabase.from("championships").update({ status: "grading" }).eq("id", data.championship_id);
      if (error) throw error;
    } else if (data.action === "tick") {
      const { error } = await supabase.rpc("tick_championships" as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDisqualifyParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ championship_id: z.string().uuid(), user_id: z.string().uuid(), reason: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await adminGuard(context);
    const { error } = await context.supabase
      .from("championship_participants")
      .update({ status: "disqualified", disqualified_reason: data.reason, disqualified_at: new Date().toISOString() })
      .eq("championship_id", data.championship_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    await context.supabase.from("championship_activity").insert({
      championship_id: data.championship_id,
      user_id: data.user_id,
      kind: "disqualified",
      message: `Disqualified: ${data.reason}`,
      severity: "error",
    });
    return { ok: true };
  });
