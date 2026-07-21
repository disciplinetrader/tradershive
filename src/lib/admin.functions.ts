import { escapeSearch } from "@/lib/search-escape";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./admin/audit.server";

async function ensurePerm(ctx: { supabase: any; userId: string }, permission: string) {
  const { data, error } = await ctx.supabase.rpc("has_permission", {
    _user_id: ctx.userId,
    _permission: permission,
  });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error(`Missing permission: ${permission}`);
}

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error || !data) throw new Error("Forbidden");
}

/**
 * Batch-fetch profiles for a list of rows and attach them under `profiles`.
 * Used because most FKs (paper_trades.user_id, admin_audit_logs.admin_id,
 * journal_entries.user_id) reference auth.users, so PostgREST cannot embed
 * public.profiles directly (PGRST200). profiles.id equals the auth user id.
 */
async function attachProfiles<T extends Record<string, any>>(
  supabase: any,
  rows: T[],
  idField: string,
): Promise<(T & { profiles: { username: string | null; display_name: string | null } | null })[]> {
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r[idField]).filter(Boolean)));
  if (!ids.length) return rows.map((r) => ({ ...r, profiles: null }));
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", ids);
  const map = new Map<string, { username: string | null; display_name: string | null }>();
  (data ?? []).forEach((p: any) => map.set(p.id, { username: p.username, display_name: p.display_name }));
  return rows.map((r) => ({ ...r, profiles: map.get(r[idField]) ?? null }));
}

// ============ DASHBOARD KPIs ============
export const getAdminKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [users, activeUsers, newUsers, trades, journal, challenges, xp, tickets] = await Promise.all([
      s.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      s.from("profiles").select("id", { count: "exact", head: true }).gte("updated_at", dayAgo),
      s.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", iso),
      s.from("paper_trades").select("id", { count: "exact", head: true }).gte("created_at", iso),
      s.from("journal_entries").select("id", { count: "exact", head: true }).gte("created_at", iso),
      s.from("user_challenges").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", iso),
      s.from("xp_transactions").select("amount").gte("created_at", iso),
      s.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const xpToday = (xp.data ?? []).reduce((sum: number, r: any) => sum + (r.amount ?? 0), 0);

    return {
      totalUsers: users.count ?? 0,
      activeUsers: activeUsers.count ?? 0,
      newUsers: newUsers.count ?? 0,
      tradesToday: trades.count ?? 0,
      journalToday: journal.count ?? 0,
      challengesToday: challenges.count ?? 0,
      xpToday,
      openTickets: tickets.count ?? 0,
      revenue: 0,
      storageBytes: 0,
      errorRate: 0,
      systemHealth: "operational" as const,
    };
  });

// ============ USERS ============
const listUsersSchema = z.object({
  search: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  status: z.enum(["all", "active", "suspended", "banned", "deleted"]).default("all"),
  page: z.number().default(1),
  pageSize: z.number().default(25),
  sortBy: z.string().default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listUsersSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:view");
    const s = context.supabase;
    let q = s
      .from("profiles")
      .select(
        "id, username, display_name, email, avatar_url, country, level, xp, coins, league, streak, is_premium, onboarded, created_at, updated_at, deleted_at",
        { count: "exact" },
      );

    if (data.status === "deleted") q = q.not("deleted_at", "is", null);
    else if (data.status === "active") q = q.is("deleted_at", null);
    else if (data.status === "suspended" || data.status === "banned") {
      // Join via user_moderation
      const { data: mods } = await s
        .from("user_moderation")
        .select("user_id")
        .eq("status", data.status);
      const ids = (mods ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return { rows: [], total: 0 };
      q = q.in("id", ids);
    } else {
      q = q.is("deleted_at", null);
    }

    if (data.search) {
      const s2 = escapeSearch(data.search);
      if (s2) q = q.or(`username.ilike.%${s2}%,email.ilike.%${s2}%,display_name.ilike.%${s2}%`);
    }

    const from = (data.page - 1) * data.pageSize;
    q = q.order(data.sortBy, { ascending: data.sortDir === "asc" }).range(from, from + data.pageSize - 1);

    const { data: rows, count, error } = await q;
    if (error) throw error;

    // Attach roles + moderation
    const ids = (rows ?? []).map((r: any) => r.id);
    const [rolesRes, modsRes] = await Promise.all([
      ids.length ? s.from("user_roles").select("user_id, role").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? s.from("user_moderation").select("user_id, status, reason, until").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const roleMap = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const modMap = new Map<string, any>();
    (modsRes.data ?? []).forEach((m: any) => modMap.set(m.user_id, m));

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        roles: roleMap.get(r.id) ?? [],
        moderation: modMap.get(r.id) ?? null,
      })),
      total: count ?? 0,
    };
  });

const userIdSchema = z.object({ userId: z.string().uuid() });

export const getUserDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:view");
    const s = context.supabase;
    const [profile, roles, mod, stats, tradeCount, journalCount] = await Promise.all([
      s.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      s.from("user_roles").select("role").eq("user_id", data.userId),
      s.from("user_moderation").select("*").eq("user_id", data.userId).order("created_at", { ascending: false }),
      s.from("gamification_stats").select("*").eq("user_id", data.userId).maybeSingle(),
      s.from("paper_trades").select("id", { count: "exact", head: true }).eq("user_id", data.userId),
      s.from("journal_entries").select("id", { count: "exact", head: true }).eq("user_id", data.userId),
    ]);
    return {
      profile: profile.data,
      roles: (roles.data ?? []).map((r: any) => r.role),
      moderation: mod.data ?? [],
      stats: stats.data,
      tradeCount: tradeCount.count ?? 0,
      journalCount: journalCount.count ?? 0,
    };
  });

export const moderateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      action: z.enum(["suspend", "unsuspend", "ban", "unban"]),
      reason: z.string().optional(),
      until: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:suspend");
    const s = context.supabase;

    if (data.action === "unsuspend" || data.action === "unban") {
      await s.from("user_moderation").insert({
        user_id: data.userId,
        status: "active",
        reason: data.reason ?? null,
        moderator_id: context.userId,
      });
    } else {
      await s.from("user_moderation").insert({
        user_id: data.userId,
        status: data.action === "ban" ? "banned" : "suspended",
        reason: data.reason ?? null,
        until: data.until ?? null,
        moderator_id: context.userId,
      });
    }
    await logAudit(s, context.userId, `user.${data.action}`, "user", data.userId, {
      reason: data.reason,
      until: data.until,
    });
    return { ok: true };
  });

export const softDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), restore: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:delete");
    const s = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: data.restore ? null : new Date().toISOString() })
      .eq("id", data.userId);
    await logAudit(s, context.userId, data.restore ? "user.restore" : "user.delete", "user", data.userId);
    return { ok: true };
  });

export const grantReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      kind: z.enum(["xp", "coins"]),
      amount: z.number().int(),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:grant");
    const s = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.kind === "xp") {
      const { data: prof } = await supabaseAdmin.from("profiles").select("xp").eq("id", data.userId).maybeSingle();
      const newBalance = (prof?.xp ?? 0) + data.amount;
      await supabaseAdmin.from("xp_transactions").insert({
        user_id: data.userId,
        delta: data.amount,
        source: "admin_grant",
        reason: data.reason ?? "Admin grant",
        balance_after: newBalance,
      });
      await supabaseAdmin.from("profiles").update({ xp: newBalance }).eq("id", data.userId);
    } else {
      const { data: prof } = await supabaseAdmin.from("profiles").select("coins").eq("id", data.userId).maybeSingle();
      const newBalance = (prof?.coins ?? 0) + data.amount;
      await supabaseAdmin.from("coin_transactions").insert({
        user_id: data.userId,
        delta: data.amount,
        source: "admin_grant",
        reason: data.reason ?? "Admin grant",
        balance_after: newBalance,
      });
      await supabaseAdmin.from("profiles").update({ coins: newBalance }).eq("id", data.userId);
    }
    await logAudit(s, context.userId, `grant.${data.kind}`, "user", data.userId, {
      amount: data.amount,
      reason: data.reason,
    });
    return { ok: true };
  });

export const resetUserData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      scope: z.enum(["xp", "coins", "challenges", "statistics", "paper_accounts"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "users:reset");
    const s = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    switch (data.scope) {
      case "xp":
        await supabaseAdmin.from("profiles").update({ xp: 0, level: 1 }).eq("id", data.userId);
        await supabaseAdmin.from("xp_transactions").delete().eq("user_id", data.userId);
        break;
      case "coins":
        await supabaseAdmin.from("profiles").update({ coins: 0 }).eq("id", data.userId);
        await supabaseAdmin.from("coin_transactions").delete().eq("user_id", data.userId);
        break;
      case "challenges":
        await supabaseAdmin.from("user_challenges").delete().eq("user_id", data.userId);
        break;
      case "statistics":
        await supabaseAdmin.from("account_statistics").delete().eq("user_id", data.userId);
        break;
      case "paper_accounts":
        await supabaseAdmin.from("paper_trades").delete().eq("user_id", data.userId);
        await supabaseAdmin.from("paper_orders").delete().eq("user_id", data.userId);
        break;
    }
    await logAudit(s, context.userId, `reset.${data.scope}`, "user", data.userId);
    return { ok: true };
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.string(),
      add: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // roles:manage only super_admin
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Only Super Admin can assign roles");
    const s = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.add) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role as any }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role as any);
    }
    await logAudit(s, context.userId, data.add ? "role.grant" : "role.revoke", "user", data.userId, {
      role: data.role,
    });
    return { ok: true };
  });

// ============ TRADES ============
export const listAdminTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().optional().nullable(),
      status: z.enum(["all", "open", "closed", "deleted"]).default("all"),
      page: z.number().default(1),
      pageSize: z.number().default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "trades:view");
    const s = context.supabase;
    let q = s.from("paper_trades").select("*", { count: "exact" });
    if (data.status === "deleted") q = q.not("deleted_at", "is", null);
    else if (data.status === "open") q = q.eq("status", "open").is("deleted_at", null);
    else if (data.status === "closed") q = q.eq("status", "closed").is("deleted_at", null);
    else q = q.is("deleted_at", null);
    if (data.search) q = q.ilike("symbol", `%${data.search.trim()}%`);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    const withProfiles = await attachProfiles(s, rows ?? [], "user_id");
    return { rows: withProfiles, total: count ?? 0 };
  });


export const softDeleteTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tradeId: z.string().uuid(), restore: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "trades:manage");
    const s = context.supabase;
    await s
      .from("paper_trades")
      .update({ deleted_at: data.restore ? null : new Date().toISOString() })
      .eq("id", data.tradeId);
    await logAudit(s, context.userId, data.restore ? "trade.restore" : "trade.delete", "trade", data.tradeId);
    return { ok: true };
  });

// ============ JOURNAL ============
export const listAdminJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().optional().nullable(),
      status: z.enum(["all", "shared", "hidden", "deleted"]).default("all"),
      page: z.number().default(1),
      pageSize: z.number().default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "journal:view");
    const s = context.supabase;
    let q = s
      .from("journal_entries")
      .select("id, symbol, pnl, rr, opened_at, status, moderation_status, deleted_at, user_id", {
        count: "exact",
      });
    if (data.status === "deleted") q = q.not("deleted_at", "is", null);
    else if (data.status === "hidden") q = q.eq("moderation_status", "hidden").is("deleted_at", null);
    else if (data.status === "shared") q = q.eq("status", "published").is("deleted_at", null);
    else q = q.is("deleted_at", null);
    if (data.search) q = q.ilike("symbol", `%${data.search.trim()}%`);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    const withProfiles = await attachProfiles(s, rows ?? [], "user_id");
    return { rows: withProfiles, total: count ?? 0 };
  });

export const moderateJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      entryId: z.string().uuid(),
      action: z.enum(["hide", "unhide", "delete", "restore"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "journal:manage");
    const s = context.supabase;
    const patch: any = {};
    if (data.action === "hide") patch.moderation_status = "hidden";
    if (data.action === "unhide") patch.moderation_status = "ok";
    if (data.action === "delete") patch.deleted_at = new Date().toISOString();
    if (data.action === "restore") patch.deleted_at = null;
    await s.from("journal_entries").update(patch).eq("id", data.entryId);
    await logAudit(s, context.userId, `journal.${data.action}`, "journal", data.entryId);
    return { ok: true };
  });

// ============ AUDIT LOGS ============
export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().optional().nullable(),
      resource: z.string().optional().nullable(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "logs:view");
    const s = context.supabase;
    let q = s
      .from("admin_audit_logs")
      .select("*", { count: "exact" });
    if (data.resource) q = q.eq("resource", data.resource);
    if (data.search) q = q.ilike("action", `%${data.search.trim()}%`);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    const withProfiles = await attachProfiles(s, rows ?? [], "admin_id");
    return { rows: withProfiles, total: count ?? 0 };
  });
