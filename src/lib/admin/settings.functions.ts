import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

async function ensurePerm(ctx: { supabase: any; userId: string }, permission: string) {
  const { data, error } = await ctx.supabase.rpc("has_permission", {
    _user_id: ctx.userId,
    _permission: permission,
  });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error(`Missing permission: ${permission}`);
}

// ============ FEATURE FLAGS ============
export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("feature_flags").select("*").order("label");
    if (error) throw error;
    return data ?? [];
  });

export const upsertFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional().nullable(),
      enabled: z.boolean(),
      rollout_percent: z.number().int().min(0).max(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "flags:manage");
    const s = context.supabase;
    const { error } = await s.from("feature_flags").upsert(
      { ...data, updated_by: context.userId, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw error;
    await logAudit(s, context.userId, "flag.update", "feature_flag", data.key, {
      enabled: data.enabled,
      rollout: data.rollout_percent,
    });
    return { ok: true };
  });

// ============ ANNOUNCEMENTS ============
export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional().nullable(),
      kind: z.enum(["banner", "popup", "notification", "news", "maintenance", "release"]),
      title: z.string().min(1),
      body: z.string().optional().nullable(),
      severity: z.enum(["info", "success", "warning", "critical"]).default("info"),
      cta_label: z.string().optional().nullable(),
      cta_url: z.string().optional().nullable(),
      starts_at: z.string().optional().nullable(),
      ends_at: z.string().optional().nullable(),
      published: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "announcements:manage");
    const s = context.supabase;
    const { id, ...rest } = data;
    const row = { ...rest, created_by: context.userId } as any;
    const { error, data: saved } = id
      ? await s.from("announcements").update(row).eq("id", id).select().maybeSingle()
      : await s.from("announcements").insert(row).select().maybeSingle();
    if (error) throw error;
    await logAudit(s, context.userId, data.id ? "announcement.update" : "announcement.create", "announcement", saved?.id);
    return saved;
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "announcements:manage");
    const s = context.supabase;
    await s.from("announcements").delete().eq("id", data.id);
    await logAudit(s, context.userId, "announcement.delete", "announcement", data.id);
    return { ok: true };
  });

// ============ SETTINGS ============
export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("system_settings").select("*").order("key");
    return data ?? [];
  });

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string(), value: z.any() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Only Super Admin can change settings");
    const s = context.supabase;
    const { error } = await s
      .from("system_settings")
      .upsert({ key: data.key, value: data.value, updated_by: context.userId }, { onConflict: "key" });
    if (error) throw error;
    await logAudit(s, context.userId, "setting.update", "setting", data.key, { value: data.value });
    return { ok: true };
  });

export const settingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("system_settings_history")
      .select("*")
      .eq("key", data.key)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });

// ============ CONTENT PAGES ============
export const listContentPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("content_pages").select("*").order("updated_at", { ascending: false });
    return data ?? [];
  });

export const upsertContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional().nullable(),
      slug: z.string().min(1),
      title: z.string().min(1),
      body: z.string().optional().nullable(),
      kind: z.enum(["faq", "help", "terms", "privacy", "tutorial", "guide", "banner", "feature"]),
      published: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "content:manage");
    const s = context.supabase;
    const { id, ...rest } = data;
    const row = { ...rest, updated_by: context.userId } as any;
    const q = id
      ? await s.from("content_pages").update(row).eq("id", id).select().maybeSingle()
      : await s.from("content_pages").insert(row).select().maybeSingle();
    if (q.error) throw q.error;
    await logAudit(s, context.userId, data.id ? "content.update" : "content.create", "content_page", q.data?.id);
    return q.data;
  });

export const deleteContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "content:manage");
    await context.supabase.from("content_pages").delete().eq("id", data.id);
    await logAudit(context.supabase, context.userId, "content.delete", "content_page", data.id);
    return { ok: true };
  });

// ============ ROLES & PERMISSIONS ============
export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [perms, mappings] = await Promise.all([
      context.supabase.from("admin_permissions").select("*").order("group_name").order("key"),
      context.supabase.from("role_permissions").select("role, permission_key"),
    ]);
    return { permissions: perms.data ?? [], mappings: mappings.data ?? [] };
  });

export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ role: z.string(), permissionKey: z.string(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Only Super Admin can edit role permissions");
    const s = context.supabase;
    if (data.enabled) {
      await s.from("role_permissions").upsert(
        { role: data.role as any, permission_key: data.permissionKey },
        { onConflict: "role,permission_key" },
      );
    } else {
      await s.from("role_permissions").delete().eq("role", data.role as any).eq("permission_key", data.permissionKey);
    }
    await logAudit(s, context.userId, "role.permission_toggle", "role", data.role, {
      permission: data.permissionKey,
      enabled: data.enabled,
    });
    return { ok: true };
  });

// ============ NOTIFICATIONS ============
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("notification_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().min(1),
      body: z.string().optional().nullable(),
      channel: z.enum(["in_app", "push", "email"]),
      audience: z.record(z.any()).default({}),
      scheduled_at: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "notifications:manage");
    const s = context.supabase;
    const { data: saved, error } = await s
      .from("notification_campaigns")
      .insert({
        ...data,
        created_by: context.userId,
        status: data.scheduled_at ? "scheduled" : "draft",
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    await logAudit(s, context.userId, "campaign.create", "campaign", saved?.id);
    return saved;
  });

// ============ STORAGE ============
export const listBucketObjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bucket: z.string(), prefix: z.string().default(""), limit: z.number().default(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "storage:view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: files, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .list(data.prefix, { limit: data.limit, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw error;
    return files ?? [];
  });

export const deleteStorageObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bucket: z.string(), path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "storage:manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(data.bucket).remove([data.path]);
    await logAudit(context.supabase, context.userId, "storage.delete", "storage", `${data.bucket}/${data.path}`);
    return { ok: true };
  });

// ============ CHALLENGES / ACHIEVEMENTS admin ============
export const listAdminChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const toggleChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "challenges:manage");
    await context.supabase.from("challenges").update({ active: data.active }).eq("id", data.id);
    await logAudit(context.supabase, context.userId, "challenge.toggle", "challenge", data.id, { active: data.active });
    return { ok: true };
  });

export const listAdminAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("achievements").select("*").order("name");
    return data ?? [];
  });

// ============ REPORTS ============
export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: z.enum(["users", "trades", "journal", "challenges", "achievements", "activity"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "reports:view");
    const s = context.supabase;
    let rows: any[] = [];
    switch (data.kind) {
      case "users":
        rows = (await s.from("profiles").select("id, username, email, country, level, xp, coins, league, created_at").limit(10000)).data ?? [];
        break;
      case "trades":
        rows = (await s.from("paper_trades").select("id, user_id, symbol, direction, pnl, rr, status, opened_at, closed_at").limit(10000)).data ?? [];
        break;
      case "journal":
        rows = (await s.from("journal_entries").select("id, user_id, symbol, pnl, rr, status, created_at").limit(10000)).data ?? [];
        break;
      case "challenges":
        rows = (await s.from("user_challenges").select("*").limit(10000)).data ?? [];
        break;
      case "achievements":
        rows = (await s.from("user_achievements").select("*").limit(10000)).data ?? [];
        break;
      case "activity":
        rows = (await s.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(5000)).data ?? [];
        break;
    }
    await s.from("system_reports").insert({
      kind: data.kind,
      generated_by: context.userId,
      row_count: rows.length,
    });
    await logAudit(s, context.userId, "report.generate", "report", data.kind, { rowCount: rows.length });
    return { rows };
  });

// ============ LEADERBOARD ADMIN ============
export const leaderboardAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      action: z.enum(["recalculate", "reset_season", "promote", "demote", "exclude", "include"]),
      userId: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "leaderboard:manage");
    const s = context.supabase;
    // These are architectural placeholders — actual recompute lives in social.functions
    await logAudit(s, context.userId, `leaderboard.${data.action}`, "leaderboard", data.userId ?? null);
    return { ok: true, action: data.action };
  });
