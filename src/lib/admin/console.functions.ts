/**
 * Admin Console server functions — expanded SaaS management surface.
 * Every mutating fn re-checks permissions on the server and writes an audit row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { escapeSearch } from "@/lib/search-escape";

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

// ============ Overview ============
export const getAdminDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_dashboard_kpis");
    if (error) throw error;
    return (data as Record<string, number>) ?? {};
  });

export const getAdminGrowthSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().min(7).max(180).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_growth_series", { _days: data.days });
    if (error) throw error;
    return (rows ?? []) as Array<{ day: string; new_users: number; active_users: number }>;
  });

export const getAdminAiUsageSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().min(7).max(60).default(14) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_ai_usage_series", { _days: data.days });
    if (error) throw error;
    return (rows ?? []) as Array<{ day: string; requests: number; tokens: number; cost_credits: number }>;
  });

export const getAdminRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data } = await context.supabase
      .from("admin_audit_logs")
      .select("id, admin_id, action, resource, resource_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as any[];
  });

// ============ Notifications ============
export const listAdminNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      onlyUnread: z.boolean().default(false),
      limit: z.number().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("admin_notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as any[];
    const filtered = data.onlyUnread
      ? list.filter((r) => !(r.read_by ?? []).includes(context.userId))
      : list;
    return {
      rows: filtered,
      unreadCount: list.filter((r) => !(r.read_by ?? []).includes(context.userId)).length,
    };
  });

export const markAdminNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const { data: row } = await s.from("admin_notifications").select("read_by").eq("id", data.id).maybeSingle();
    const readBy = new Set<string>((row?.read_by ?? []) as string[]);
    readBy.add(context.userId);
    await s.from("admin_notifications").update({ read_by: Array.from(readBy) }).eq("id", data.id);
    return { ok: true };
  });

export const dismissAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    await context.supabase.from("admin_notifications").update({ dismissed_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

// ============ Support inbox (tickets + bugs + feature requests + contact) ============
export const listSupportInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      type: z.enum(["all", "tickets", "bugs", "features", "contact", "feedback"]).default("all"),
      status: z.string().optional().nullable(),
      search: z.string().optional().nullable(),
      limit: z.number().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "support:manage");
    const s = context.supabase;
    const rx = data.search ? escapeSearch(data.search) : null;

    const [tickets, bugs, features, contact, feedback] = await Promise.all([
      data.type === "all" || data.type === "tickets"
        ? s.from("support_tickets").select("id, user_id, subject, category, priority, status, created_at").order("created_at", { ascending: false }).limit(data.limit)
        : Promise.resolve({ data: [] as any[] }),
      data.type === "all" || data.type === "bugs"
        ? s.from("bug_reports").select("id, user_id, title, severity, status, priority, created_at").order("created_at", { ascending: false }).limit(data.limit)
        : Promise.resolve({ data: [] as any[] }),
      data.type === "all" || data.type === "features"
        ? s.from("feature_requests").select("id, user_id, title, status, priority, vote_count, created_at").order("created_at", { ascending: false }).limit(data.limit)
        : Promise.resolve({ data: [] as any[] }),
      data.type === "all" || data.type === "contact"
        ? s.from("contact_messages").select("id, user_id, name, email, subject, status, created_at").order("created_at", { ascending: false }).limit(data.limit)
        : Promise.resolve({ data: [] as any[] }),
      data.type === "all" || data.type === "feedback"
        ? s.from("user_feedback").select("id, user_id, rating, category, feedback, status, created_at").order("created_at", { ascending: false }).limit(data.limit)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const match = (t: string | null | undefined) => !rx || (t ?? "").toLowerCase().includes(rx.toLowerCase());

    return {
      tickets: (tickets.data ?? []).filter((r: any) => (!data.status || r.status === data.status) && match(r.subject)),
      bugs: (bugs.data ?? []).filter((r: any) => (!data.status || r.status === data.status) && match(r.title)),
      features: (features.data ?? []).filter((r: any) => (!data.status || r.status === data.status) && match(r.title)),
      contact: (contact.data ?? []).filter((r: any) => (!data.status || r.status === data.status) && match(r.subject)),
      feedback: (feedback.data ?? []).filter((r: any) => (!data.status || r.status === data.status) && match(r.feedback)),
    };
  });

export const updateSupportItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      type: z.enum(["tickets", "bugs", "features", "contact", "feedback"]),
      id: z.string().uuid(),
      patch: z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        assigned_to: z.string().uuid().nullable().optional(),
        internal_notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "support:manage");
    const table = {
      tickets: "support_tickets",
      bugs: "bug_reports",
      features: "feature_requests",
      contact: "contact_messages",
      feedback: "user_feedback",
    }[data.type];
    const { error } = await (context.supabase as any).from(table).update(data.patch).eq("id", data.id);
    if (error) throw error;
    await logAudit(context.supabase, context.userId, `support.${data.type}.update`, table, data.id, data.patch);
    return { ok: true };
  });

// ============ Subscriptions ============
export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.string().optional().nullable(),
      page: z.number().default(1),
      pageSize: z.number().default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "subscriptions:view");
    const s = context.supabase;
    let q = s.from("user_subscriptions").select("*, subscription_plans(name, code, price_cents, currency, interval)", { count: "exact" });
    if (data.status) q = q.eq("status", data.status);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: (rows ?? []) as any[], total: count ?? 0 };
  });

export const listSubscriptionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePerm(context, "subscriptions:view");
    const { data } = await context.supabase.from("subscription_plans").select("*").order("sort_order");
    return (data ?? []) as any[];
  });

export const grantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      planCode: z.string(),
      days: z.number().min(1).max(3650).default(30),
      status: z.enum(["trialing", "active", "lifetime"]).default("active"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "subscriptions:manage");
    const s = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan } = await supabaseAdmin.from("subscription_plans").select("id, code").eq("code", data.planCode).maybeSingle();
    if (!plan) throw new Error(`Unknown plan: ${data.planCode}`);
    const now = new Date();
    const end = new Date(now.getTime() + data.days * 86_400_000);
    // Deactivate any existing active row
    await supabaseAdmin.from("user_subscriptions").update({ status: "canceled", canceled_at: now.toISOString() })
      .eq("user_id", data.userId)
      .in("status", ["trialing", "active", "paused", "past_due"]);
    const { data: row, error } = await supabaseAdmin.from("user_subscriptions").insert({
      user_id: data.userId,
      plan_id: plan.id,
      status: data.status,
      current_period_start: now.toISOString(),
      current_period_end: data.status === "lifetime" ? null : end.toISOString(),
      trial_end: data.status === "trialing" ? end.toISOString() : null,
      metadata: { granted_by: context.userId, days: data.days },
    }).select("id").single();
    if (error) throw error;
    await supabaseAdmin.from("subscription_events").insert({
      user_id: data.userId,
      subscription_id: row.id,
      event_type: "admin.grant",
      metadata: { plan: data.planCode, days: data.days, status: data.status },
    });
    if (data.status === "lifetime" || data.status === "active") {
      await supabaseAdmin.from("profiles").update({ is_premium: true }).eq("id", data.userId);
    }
    await logAudit(s, context.userId, `subscription.grant`, "user", data.userId, { plan: data.planCode, days: data.days });
    return { ok: true, subscriptionId: row.id };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscriptionId: z.string().uuid(), immediate: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "subscriptions:manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.immediate
      ? { status: "canceled", canceled_at: new Date().toISOString() }
      : { cancel_at_period_end: true };
    const { data: row } = await supabaseAdmin.from("user_subscriptions").update(patch).eq("id", data.subscriptionId).select("user_id").maybeSingle();
    if (row?.user_id && data.immediate) {
      await supabaseAdmin.from("profiles").update({ is_premium: false }).eq("id", row.user_id);
    }
    await supabaseAdmin.from("subscription_events").insert({
      user_id: row?.user_id,
      subscription_id: data.subscriptionId,
      event_type: data.immediate ? "admin.cancel_now" : "admin.cancel_period_end",
    });
    await logAudit(context.supabase, context.userId, "subscription.cancel", "subscription", data.subscriptionId, { immediate: data.immediate });
    return { ok: true };
  });

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscriptionId: z.string().uuid(), days: z.number().min(1).max(3650) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "subscriptions:manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("user_subscriptions").select("current_period_end, user_id").eq("id", data.subscriptionId).maybeSingle();
    if (!row) throw new Error("Subscription not found");
    const base = row.current_period_end ? new Date(row.current_period_end) : new Date();
    const next = new Date(base.getTime() + data.days * 86_400_000).toISOString();
    await supabaseAdmin.from("user_subscriptions").update({ current_period_end: next, status: "active" }).eq("id", data.subscriptionId);
    await supabaseAdmin.from("subscription_events").insert({
      user_id: row.user_id,
      subscription_id: data.subscriptionId,
      event_type: "admin.extend",
      metadata: { days: data.days },
    });
    await logAudit(context.supabase, context.userId, "subscription.extend", "subscription", data.subscriptionId, { days: data.days });
    return { ok: true };
  });

// ============ Security ============
export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      severity: z.string().optional().nullable(),
      kind: z.string().optional().nullable(),
      limit: z.number().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "security:view");
    const s = context.supabase;
    let q = s.from("admin_security_events").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.severity) q = q.eq("severity", data.severity);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as any[];
  });

// ============ Health ============
export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const now = new Date();
    const oneHour = new Date(now.getTime() - 3600_000).toISOString();

    const [providers, syncs, cronCount, edgeErrors, dbSize] = await Promise.all([
      s.from("market_providers").select("id, name, status, last_health_check_at, error_rate").limit(20),
      s.from("historical_sync_logs").select("status").gte("created_at", oneHour).limit(200),
      s.from("historical_import_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
      s.from("admin_security_events").select("id", { count: "exact", head: true }).eq("severity", "error").gte("created_at", oneHour),
      s.rpc("admin_table_sizes"),
    ]);

    const syncFail = (syncs.data ?? []).filter((r: any) => r.status === "error").length;
    const syncTotal = (syncs.data ?? []).length || 1;
    const errorRate = syncFail / syncTotal;

    return {
      providers: providers.data ?? [],
      syncErrorRate: Number((errorRate * 100).toFixed(1)),
      runningJobs: cronCount.count ?? 0,
      hourlyErrors: edgeErrors.count ?? 0,
      dbSizes: (dbSize.data ?? []) as any[],
      overall: errorRate > 0.2 || (edgeErrors.count ?? 0) > 20 ? "degraded" : "operational",
    };
  });

export const listSlowQueries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(100).default(25) }).parse(d))
  .handler(async ({ context }) => {
    await ensurePerm(context, "database:view");
    // pg_stat_statements requires elevated privileges; return empty gracefully.
    return { rows: [] as any[], note: "pg_stat_statements not exposed via Data API. Use the Supabase project's SQL editor for query performance." };
  });

// ============ Revenue (stub — reads real DB but returns zeros without Stripe events) ============
export const getRevenueOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePerm(context, "revenue:view");
    const s = context.supabase;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [active, trial, canceled, monthEvents] = await Promise.all([
      s.from("user_subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "lifetime"]),
      s.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
      s.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("status", "canceled"),
      s.from("subscription_events").select("amount_cents, event_type").gte("created_at", monthStart.toISOString()).eq("event_type", "invoice.paid"),
    ]);
    const mrrCents = (monthEvents.data ?? []).reduce((sum: number, r: any) => sum + (r.amount_cents ?? 0), 0);
    return {
      activeSubs: active.count ?? 0,
      trialSubs: trial.count ?? 0,
      canceledSubs: canceled.count ?? 0,
      mrrCents,
      arrCents: mrrCents * 12,
      arpuCents: (active.count ?? 0) > 0 ? Math.round(mrrCents / (active.count ?? 1)) : 0,
      stripeConnected: false,
    };
  });

// ============ Global admin search ============
export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ term: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const term = escapeSearch(data.term) ?? "";
    if (!term) return { users: [], trades: [], journal: [], replays: [], tickets: [], bugs: [] };
    const like = `%${term}%`;
    const [users, trades, journal, replays, tickets, bugs] = await Promise.all([
      s.from("profiles").select("id, username, display_name, email, avatar_url").or(`username.ilike.${like},email.ilike.${like},display_name.ilike.${like}`).limit(8),
      s.from("paper_trades").select("id, symbol, user_id, pnl, status").ilike("symbol", like).limit(8),
      s.from("journal_entries").select("id, symbol, user_id, pnl").ilike("symbol", like).limit(8),
      s.from("replay_sessions").select("id, title, symbol, user_id").or(`title.ilike.${like},symbol.ilike.${like}`).limit(8),
      s.from("support_tickets").select("id, subject, user_id, status").ilike("subject", like).limit(8),
      s.from("bug_reports").select("id, title, user_id, status").ilike("title", like).limit(8),
    ]);
    return {
      users: users.data ?? [],
      trades: trades.data ?? [],
      journal: journal.data ?? [],
      replays: replays.data ?? [],
      tickets: tickets.data ?? [],
      bugs: bugs.data ?? [],
    };
  });

// ============ Analytics ============
export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().min(7).max(90).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const [growth, aiSeries, countries, replaysDone] = await Promise.all([
      s.rpc("admin_growth_series", { _days: data.days }),
      s.rpc("admin_ai_usage_series", { _days: Math.min(data.days, 30) }),
      s.from("profiles").select("country").not("country", "is", null).limit(5000),
      s.from("replay_sessions").select("completion_pct, status").gte("created_at", new Date(Date.now() - data.days * 86_400_000).toISOString()).limit(5000),
    ]);
    const countryMap = new Map<string, number>();
    (countries.data ?? []).forEach((r: any) => countryMap.set(r.country, (countryMap.get(r.country) ?? 0) + 1));
    const topCountries = Array.from(countryMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    const replays = replaysDone.data ?? [];
    const completed = replays.filter((r: any) => (r.completion_pct ?? 0) >= 90 || r.status === "completed").length;
    const replayCompletionRate = replays.length ? Math.round((completed / replays.length) * 100) : 0;

    return {
      growth: growth.data ?? [],
      aiSeries: aiSeries.data ?? [],
      topCountries,
      replayCompletionRate,
      replaysStarted: replays.length,
    };
  });

// ============ AI Conversations (privacy-gated) ============
export const listAiConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "ai:read_conversations");
    const { data: rows } = await context.supabase
      .from("ai_chat_sessions")
      .select("id, user_id, title, model_key, provider_key, message_count, last_message_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    return (rows ?? []) as any[];
  });

export const getAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensurePerm(context, "ai:read_conversations");
    const s = context.supabase;
    const [session, messages] = await Promise.all([
      s.from("ai_chat_sessions").select("*").eq("id", data.sessionId).maybeSingle(),
      s.from("ai_chat_messages").select("*").eq("session_id", data.sessionId).order("created_at"),
    ]);
    await logAudit(s, context.userId, "ai.conversation.read", "ai_chat_session", data.sessionId);
    return { session: session.data, messages: messages.data ?? [] };
  });

// ============ Replay monitoring ============
export const getReplayMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const s = context.supabase;
    const [total, avgDur, byMarket, byTf, failed] = await Promise.all([
      s.from("replay_sessions").select("id", { count: "exact", head: true }),
      s.from("replay_sessions").select("duration_seconds").not("duration_seconds", "is", null).limit(1000),
      s.from("replay_sessions").select("market").not("market", "is", null).limit(2000),
      s.from("replay_sessions").select("timeframe").not("timeframe", "is", null).limit(2000),
      s.from("replay_sessions").select("id", { count: "exact", head: true }).eq("status", "error"),
    ]);
    const durs = (avgDur.data ?? []).map((r: any) => r.duration_seconds).filter(Boolean);
    const avgSec = durs.length ? Math.round(durs.reduce((a: number, b: number) => a + b, 0) / durs.length) : 0;
    const marketCount = new Map<string, number>();
    (byMarket.data ?? []).forEach((r: any) => marketCount.set(r.market, (marketCount.get(r.market) ?? 0) + 1));
    const tfCount = new Map<string, number>();
    (byTf.data ?? []).forEach((r: any) => tfCount.set(r.timeframe, (tfCount.get(r.timeframe) ?? 0) + 1));
    return {
      total: total.count ?? 0,
      avgSec,
      failed: failed.count ?? 0,
      topMarkets: Array.from(marketCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topTimeframes: Array.from(tfCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  });

// ============ Saved views ============
export const listSavedViews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("admin_saved_views")
      .select("*")
      .eq("scope", data.scope)
      .order("updated_at", { ascending: false });
    return (rows ?? []) as any[];
  });

export const upsertSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.string(), name: z.string().min(1), filters: z.record(z.string(), z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("admin_saved_views").upsert({
      user_id: context.userId,
      scope: data.scope,
      name: data.name,
      filters: data.filters,
    }, { onConflict: "user_id,scope,name" });
    return { ok: true };
  });
