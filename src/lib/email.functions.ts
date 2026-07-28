/**
 * Client-safe server functions for the email subsystem.
 *
 * Users can read/update their own preferences and read their own event log.
 * Admins get global list/stats/actions. Nothing here imports service.server
 * or client.server at module scope; those load inside handlers so this file
 * stays safe to import from client bundles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error || !data) throw new Error("Forbidden");
}

/* ------------------------- user preferences ------------------------- */

const PREF_KEYS = [
  "master_enabled",
  "welcome_series",
  "weekly_report",
  "monthly_report",
  "achievements",
  "product_updates",
  "reengagement",
  "marketing",
  "billing",
] as const;

const PrefsPatch = z
  .object(
    Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
      (typeof PREF_KEYS)[number],
      z.ZodOptional<z.ZodBoolean>
    >,
  )
  .strict();

export const getMyEmailPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("email_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (data) return data;
    const { data: created } = await context.supabase
      .from("email_preferences")
      .insert({ user_id: context.userId })
      .select("*")
      .single();
    return created;
  });

export const updateMyEmailPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => PrefsPatch.parse(raw))
  .handler(async ({ data, context }) => {
    if (Object.keys(data).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("email_preferences")
      .update(data)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyEmailEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("email_events")
      .select("id, template, category, status, subject, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

/* ------------------------- admin dashboard ------------------------- */

const AdminListInput = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  template: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const adminListEmailEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => AdminListInput.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("email_events")
      .select("id, template, category, status, subject, to_email, provider, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    if (data.template) q = q.eq("template", data.template);
    if (data.search) q = q.ilike("to_email", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminListEmailQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data } = await context.supabase
      .from("email_queue")
      .select("id, template, category, status, subject, to_email, attempts, max_attempts, scheduled_for, last_error, created_at")
      .in("status", ["pending", "processing", "failed"])
      .order("scheduled_for", { ascending: true })
      .limit(100);
    return data ?? [];
  });

export const adminEmailStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await context.supabase
      .from("email_events")
      .select("status, category, template, created_at")
      .gte("created_at", since)
      .limit(5000);

    const totals: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byTemplate: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    for (const ev of (events ?? []) as Array<Record<string, string>>) {
      totals[ev.status] = (totals[ev.status] ?? 0) + 1;
      byCategory[ev.category] = (byCategory[ev.category] ?? 0) + 1;
      byTemplate[ev.template] = (byTemplate[ev.template] ?? 0) + 1;
      const day = ev.created_at.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const { count: queueDepth } = await context.supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    const { count: queueFailed } = await context.supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    return {
      totals,
      byCategory,
      byTemplate,
      byDay,
      queueDepth: queueDepth ?? 0,
      queueFailed: queueFailed ?? 0,
      windowDays: 30,
    };
  });

const IdInput = z.object({ id: z.string().uuid() });

export const adminRetryQueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("email_queue")
      .update({ status: "pending", attempts: 0, last_error: null, scheduled_for: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCancelQueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("email_queue")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const TestSendInput = z.object({
  template: z.string(),
  toEmail: z.string().email(),
});

export const adminSendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => TestSendInput.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { dispatchEmail } = await import("./email/service.server");
    const { getTemplate } = await import("./email/templates");
    // Best-effort props defaults per template so admins can dry-run any one.
    const template = getTemplate(data.template as any);
    const defaults: Record<string, unknown> = {
      welcome: { name: "Trader" },
      verify_email: { verifyUrl: "https://tradershive.lovable.app/auth" },
      password_reset: { resetUrl: "https://tradershive.lovable.app/auth" },
      password_changed: { when: new Date().toUTCString(), ip: "127.0.0.1" },
      login_alert: { when: new Date().toUTCString(), device: "Chrome / macOS", ip: "127.0.0.1" },
      welcome_series_day2: { name: "Trader" },
      welcome_series_day5: { name: "Trader" },
      product_update: { headline: "Test product update", body: "This is a test.", ctaLabel: "Open app", ctaUrl: "https://tradershive.lovable.app" },
      achievement_unlocked: { name: "Trader", badgeName: "First Blood", badgeDescription: "Your first paper trade closed profitable.", xp: 50 },
      weekly_report: { name: "Trader", periodLabel: "this week", trades: 12, winRate: "58%", netPnl: "+$1,240", bestTrade: "EURUSD +$540", worstTrade: "GBPJPY -$210", topInsight: "London session is your best window." },
      monthly_report: { name: "Trader", periodLabel: "November", trades: 84, winRate: "54%", netPnl: "+$4,110", bestTrade: "XAUUSD +$1,120", worstTrade: "US30 -$680", topInsight: "Fewer trades on Fridays lift expectancy." },
      reengagement_3d: { name: "Trader" },
      reengagement_7d: { name: "Trader" },
      reengagement_14d: { name: "Trader" },
      reengagement_30d: { name: "Trader" },
      billing_receipt: { amount: "$19.00", period: "November", invoiceUrl: "https://tradershive.lovable.app/settings" },
      billing_failed: { amount: "$19.00", updateUrl: "https://tradershive.lovable.app/settings" },
    };
    const result = await dispatchEmail({
      to: { email: data.toEmail, userId: context.userId, name: "Test Recipient" },
      templateId: template.id,
      props: defaults[template.id] ?? {},
      immediate: true,
      metadata: { source: "admin_test" },
    });
    return result;
  });

export const adminListEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { TEMPLATES } = await import("./email/templates");
    return Object.values(TEMPLATES).map((t) => ({
      id: t.id,
      category: t.category,
      preferenceKey: t.preferenceKey,
      alwaysSend: Boolean(t.alwaysSend),
    }));
  });

export const adminEmailProviderInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { activeProviderName } = await import("./email/service.server");
    const { listRegisteredProviders } = await import("./email/providers");
    return {
      active: activeProviderName(),
      registered: listRegisteredProviders(),
      billingEnabled: (process.env.EMAIL_BILLING_ENABLED ?? "").toLowerCase() === "true",
      isProduction: process.env.NODE_ENV === "production",
    };
  });
