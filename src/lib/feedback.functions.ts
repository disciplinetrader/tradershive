/**
 * Feedback & Bug Reporting server functions.
 *
 * Handles user submissions (bug, general, question, compliment, feature request),
 * admin management (list, update status/priority/assignee, notes), analytics KPIs,
 * and signed upload URLs for the `feedback-attachments` private storage bucket.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MetadataSchema = z
  .object({
    app_version: z.string().max(64).optional(),
    browser: z.string().max(200).optional(),
    os: z.string().max(200).optional(),
    screen: z.string().max(64).optional(),
    viewport: z.string().max(64).optional(),
    timezone: z.string().max(64).optional(),
    language: z.string().max(32).optional(),
    theme: z.string().max(16).optional(),
    current_route: z.string().max(300).optional(),
    current_url: z.string().max(600).optional(),
    user_agent: z.string().max(600).optional(),
  })
  .partial();

const AttachmentSchema = z.object({
  path: z.string().min(1).max(300),
  name: z.string().max(200),
  size: z.number().nonnegative(),
  type: z.string().max(80),
  kind: z.enum(["screenshot", "recording", "file"]).default("file"),
});

const BUG_TYPE = z.enum(["bug", "general", "question", "compliment"]);
const CATEGORY = z.enum([
  "replay_studio",
  "trading_workspace",
  "journal",
  "analytics",
  "ai_coach",
  "performance",
  "community",
  "billing",
  "other",
]);
const SEVERITY = z.enum(["critical", "high", "medium", "low"]);
const USER_PRIORITY = z.enum(["nice_to_have", "useful", "important", "critical"]);

async function assertSupport(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_permission", {
    _user_id: ctx.userId,
    _permission: "support:manage",
  });
  if (error || !data) throw new Error("Forbidden");
}

// -------- Submit bug / general / question / compliment --------
export const submitBugReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: BUG_TYPE,
        title: z.string().trim().min(3).max(200),
        description: z.string().trim().min(1).max(5000),
        expected_behavior: z.string().max(2000).optional().default(""),
        actual_behavior: z.string().max(2000).optional().default(""),
        severity: SEVERITY.default("medium"),
        category: CATEGORY.optional(),
        reproduction_steps: z.array(z.string().max(500)).max(20).default([]),
        satisfaction_rating: z.number().int().min(1).max(5).optional(),
        rating_comment: z.string().max(1000).optional(),
        attachments: z.array(AttachmentSchema).max(10).default([]),
        metadata: MetadataSchema.default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      user_id: context.userId,
      type: data.type,
      title: data.title,
      description: data.description,
      expected_behavior: data.expected_behavior || null,
      actual_behavior: data.actual_behavior || null,
      severity: data.severity,
      category: data.category ?? null,
      reproduction_steps: data.reproduction_steps,
      attachments: data.attachments,
      metadata: data.metadata,
      satisfaction_rating: data.satisfaction_rating ?? null,
      rating_comment: data.rating_comment ?? null,
      status: "open",
      url: (data.metadata as any)?.current_url ?? null,
      browser: (data.metadata as any)?.browser ?? null,
      device: (data.metadata as any)?.os ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("bug_reports")
      .insert(payload)
      .select("id, reference_code, type, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------- Submit feature request --------
export const submitFeatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(200),
        description: z.string().trim().min(1).max(5000),
        why_valuable: z.string().max(2000).optional().default(""),
        user_priority: USER_PRIORITY.default("useful"),
        category: CATEGORY.optional(),
        attachments: z.array(AttachmentSchema).max(10).default([]),
        metadata: MetadataSchema.default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("feature_requests")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description,
        why_valuable: data.why_valuable || null,
        user_priority: data.user_priority,
        category: data.category ?? null,
        attachments: data.attachments,
        metadata: data.metadata,
        status: "open",
      })
      .select("id, reference_code, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------- Signed upload URL for private attachments --------
export const createFeedbackUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        content_type: z.string().max(120),
        size: z.number().int().positive().max(100 * 1024 * 1024),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `${context.userId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("feedback-attachments")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return {
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
    };
  });

export const getFeedbackAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("feedback-attachments")
      .createSignedUrl(data.path, 60 * 15);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// -------- User: my submissions --------
export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [bugs, features] = await Promise.all([
      context.supabase
        .from("bug_reports")
        .select("id, reference_code, type, title, status, severity, category, created_at, updated_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("feature_requests")
        .select("id, reference_code, title, status, user_priority, category, created_at, updated_at, vote_count")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (bugs.error) throw new Error(bugs.error.message);
    if (features.error) throw new Error(features.error.message);
    return { bugs: bugs.data ?? [], features: features.data ?? [] };
  });

// -------- Admin: list & filter --------
export const adminListFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z.enum(["bugs", "features"]).default("bugs"),
        status: z.string().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
        assignee: z.string().uuid().optional(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSupport(context);
    const table = data.source === "bugs" ? "bug_reports" : "feature_requests";
    let q = context.supabase.from(table).select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.category) q = q.eq("category", data.category);
    if (data.assignee) q = q.eq("assignee_id", data.assignee);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, (m) => `\\${m}`);
      q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,reference_code.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- Admin: update --------
export const adminUpdateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z.enum(["bugs", "features"]),
        id: z.string().uuid(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        internal_notes: z.string().max(5000).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        resolve: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSupport(context);
    const table = data.source === "bugs" ? "bug_reports" : "feature_requests";
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assignee_id !== undefined) patch.assignee_id = data.assignee_id;
    if (data.internal_notes !== undefined) patch.internal_notes = data.internal_notes;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.resolve && data.source === "bugs") patch.resolved_at = new Date().toISOString();
    const { data: row, error } = await context.supabase.from(table).update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------- Admin: notes --------
export const listFeedbackNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ parent_type: z.enum(["bug", "feature"]), parent_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSupport(context);
    const { data: rows, error } = await context.supabase
      .from("feedback_notes")
      .select("id, body, author_id, created_at")
      .eq("parent_type", data.parent_type)
      .eq("parent_id", data.parent_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addFeedbackNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        parent_type: z.enum(["bug", "feature"]),
        parent_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSupport(context);
    const { data: row, error } = await context.supabase
      .from("feedback_notes")
      .insert({
        parent_type: data.parent_type,
        parent_id: data.parent_id,
        author_id: context.userId,
        body: data.body,
      })
      .select("id, body, author_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------- Admin: KPIs / analytics --------
export const adminFeedbackKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupport(context);
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [openBugs, resolvedBugs, avgRow, topRoutesRow, topFeatures, ratingRow, bugTrendRow] = await Promise.all([
      context.supabase.from("bug_reports").select("id", { count: "exact", head: true }).in("status", ["open", "triaged", "in_progress", "testing"]),
      context.supabase.from("bug_reports").select("id", { count: "exact", head: true }).in("status", ["resolved", "closed"]),
      context.supabase.from("bug_reports").select("created_at, resolved_at").not("resolved_at", "is", null).gte("resolved_at", since30).limit(500),
      context.supabase.from("bug_reports").select("metadata, url").gte("created_at", since30).limit(1000),
      context.supabase.from("feature_requests").select("id, title, vote_count, user_priority").order("vote_count", { ascending: false }).limit(5),
      context.supabase.from("bug_reports").select("satisfaction_rating").not("satisfaction_rating", "is", null).gte("created_at", since30).limit(1000),
      context.supabase.from("bug_reports").select("created_at").gte("created_at", since30).limit(2000),
    ]);

    const avgMs = (() => {
      const rows = (avgRow.data as any[]) ?? [];
      if (!rows.length) return 0;
      const total = rows.reduce((acc, r) => acc + (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()), 0);
      return Math.round(total / rows.length);
    })();

    const routeCounts = new Map<string, number>();
    for (const r of ((topRoutesRow.data as any[]) ?? [])) {
      const route = r.metadata?.current_route ?? r.url ?? "unknown";
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    }
    const topRoutes = [...routeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([route, count]) => ({ route, count }));

    const ratings = ((ratingRow.data as any[]) ?? []).map((r) => r.satisfaction_rating).filter(Boolean) as number[];
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const trend = new Map<string, number>();
    for (const r of ((bugTrendRow.data as any[]) ?? [])) {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      trend.set(day, (trend.get(day) ?? 0) + 1);
    }
    const trendSeries = [...trend.entries()].sort().map(([day, count]) => ({ day, count }));

    return {
      open_bugs: openBugs.count ?? 0,
      resolved_bugs: resolvedBugs.count ?? 0,
      avg_resolution_ms: avgMs,
      top_routes: topRoutes,
      top_features: (topFeatures.data as any[]) ?? [],
      avg_satisfaction: Number(avgRating.toFixed(2)),
      satisfaction_count: ratings.length,
      trend_30d: trendSeries,
    };
  });
