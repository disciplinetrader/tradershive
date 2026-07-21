import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeStrategyStats } from "./strategy/calculations";

/* ================= Strategies ================= */

const upsertStrategySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  market: z.string().max(64).nullable().optional(),
  markets: z.array(z.string()).default([]),
  symbols: z.array(z.string()).default([]),
  timeframes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  market_conditions: z.array(z.string()).default([]),
  color: z.string().default("#8b5cf6"),
  icon: z.string().default("Sparkles"),
  cover_url: z.string().nullable().optional(),
  status: z.enum(["draft","private","public","archived"]).default("draft"),
  difficulty: z.enum(["beginner","intermediate","advanced","expert"]).default("intermediate"),
  estimated_timeframe: z.string().max(64).nullable().optional(),
  entry_rules: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  exit_rules: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  risk_rules: z.record(z.any()).default({}),
  trade_management: z.record(z.any()).default({}),
  position_sizing: z.record(z.any()).default({}),
  notes: z.string().nullable().optional(),
  is_favorite: z.boolean().optional(),
  is_active: z.boolean().optional(),
  change_notes: z.string().max(500).optional(),
});

export const upsertStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertStrategySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, change_notes, ...fields } = data;
    const now = new Date().toISOString();
    if (id) {
      // load current for version snapshot
      const { data: current, error: e0 } = await context.supabase
        .from("strategies").select("*").eq("id", id).eq("user_id", context.userId).maybeSingle();
      if (e0) throw e0;
      if (!current) throw new Error("Strategy not found");
      const nextVersion = (current.version ?? 1) + 1;
      // snapshot previous
      await context.supabase.from("strategy_versions").insert({
        strategy_id: id, user_id: context.userId, version: current.version ?? 1,
        snapshot: current, change_notes: change_notes ?? null,
      });
      const publish = fields.status === "public" && current.status !== "public";
      const { data: row, error } = await context.supabase
        .from("strategies")
        .update({ ...fields, version: nextVersion, updated_at: now, published_at: publish ? now : current.published_at })
        .eq("id", id).eq("user_id", context.userId)
        .select().single();
      if (error) throw error;
      await context.supabase.from("strategy_history").insert({
        strategy_id: id, user_id: context.userId, action: "update",
        detail: { version: nextVersion, notes: change_notes ?? null },
      });
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("strategies")
      .insert({ ...fields, user_id: context.userId, published_at: fields.status === "public" ? now : null })
      .select().single();
    if (error) throw error;
    await context.supabase.from("strategy_history").insert({
      strategy_id: row.id, user_id: context.userId, action: "create", detail: {},
    });
    return row;
  });

export const listStrategies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("strategies").select("*").eq("user_id", context.userId)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: strategy }, { data: checklists }, { data: items }, { data: examples }, { data: versions }, { data: playbooks }] = await Promise.all([
      context.supabase.from("strategies").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("strategy_checklists").select("*").eq("strategy_id", data.id).order("sort_order"),
      context.supabase.from("strategy_checklist_items").select("*").eq("user_id", context.userId).order("sort_order"),
      context.supabase.from("strategy_examples").select("*").eq("strategy_id", data.id).order("sort_order"),
      context.supabase.from("strategy_versions").select("id,version,change_notes,created_at").eq("strategy_id", data.id).order("version", { ascending: false }),
      context.supabase.from("strategy_playbooks").select("*").eq("strategy_id", data.id).order("updated_at", { ascending: false }),
    ]);
    if (!strategy) throw new Error("Not found");
    const checklistsWithItems = (checklists ?? []).map((c) => ({
      ...c, items: (items ?? []).filter((i) => i.checklist_id === c.id),
    }));
    return { strategy, checklists: checklistsWithItems, examples: examples ?? [], versions: versions ?? [], playbooks: playbooks ?? [] };
  });

export const deleteStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase.from("strategies").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!src) throw new Error("Not found");
    const { id, created_at, updated_at, published_at, version, ...rest } = src as any;
    const { data: row, error: e2 } = await context.supabase
      .from("strategies").insert({
        ...rest,
        user_id: context.userId,
        name: `${src.name} (copy)`,
        status: "draft", is_favorite: false, version: 1, published_at: null,
      })
      .select().single();
    if (e2) throw e2;
    return row;
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies")
      .update({ is_favorite: data.value }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const setStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["draft","private","public","archived"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const updates: any = { status: data.status };
    if (data.status === "public") updates.published_at = now;
    if (data.status === "archived") updates.archived_at = now;
    const { error } = await context.supabase.from("strategies").update(updates).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ================= Templates ================= */

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("strategy_templates").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase.from("strategy_templates").select("*").eq("id", data.template_id).maybeSingle();
    if (error) throw error;
    if (!t) throw new Error("Template not found");
    const payload = (t.data ?? {}) as any;
    const { data: row, error: e2 } = await context.supabase.from("strategies").insert({
      user_id: context.userId,
      name: t.name,
      description: t.description,
      category: t.category,
      difficulty: t.difficulty,
      markets: t.markets ?? [],
      timeframes: t.timeframes ?? [],
      tags: t.tags ?? [],
      color: t.color, icon: t.icon,
      entry_rules: payload.entry_rules ?? [],
      exit_rules: payload.exit_rules ?? [],
      risk_rules: payload.risk_rules ?? {},
      trade_management: payload.trade_management ?? {},
      status: "draft",
      template_source: t.id,
    }).select().single();
    if (e2) throw e2;
    return row;
  });

/* ================= Checklists ================= */

export const upsertChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    strategy_id: z.string().uuid(),
    kind: z.string(),
    title: z.string().min(1).max(120),
    items: z.array(z.object({ id: z.string().uuid().optional(), label: z.string().min(1).max(200), required: z.boolean().optional() })).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let checklistId = data.id;
    if (!checklistId) {
      const { data: row, error } = await context.supabase.from("strategy_checklists").insert({
        strategy_id: data.strategy_id, user_id: context.userId, kind: data.kind, title: data.title,
      }).select().single();
      if (error) throw error;
      checklistId = row.id;
    } else {
      await context.supabase.from("strategy_checklists").update({ title: data.title, kind: data.kind })
        .eq("id", checklistId).eq("user_id", context.userId);
      await context.supabase.from("strategy_checklist_items").delete().eq("checklist_id", checklistId).eq("user_id", context.userId);
    }
    if (data.items.length) {
      await context.supabase.from("strategy_checklist_items").insert(
        data.items.map((it, i) => ({
          checklist_id: checklistId!, user_id: context.userId,
          label: it.label, required: it.required ?? false, sort_order: i,
        })),
      );
    }
    return { id: checklistId };
  });

export const deleteChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("strategy_checklists").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

/* ================= Examples ================= */

export const addExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    strategy_id: z.string().uuid(),
    ref_type: z.enum(["trade","journal","replay","image","video","document","note"]),
    ref_id: z.string().uuid().optional().nullable(),
    title: z.string().max(200).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    url: z.string().max(2000).optional().nullable(),
    metadata: z.record(z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("strategy_examples").insert({
      ...data, user_id: context.userId,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const deleteExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("strategy_examples").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

/* ================= Playbooks ================= */

const upsertPlaybookSchema = z.object({
  id: z.string().uuid().optional(),
  strategy_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  overview: z.string().nullable().optional(),
  rules: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  checklist: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  mistakes: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  examples: z.array(z.any()).default([]),
  color: z.string().default("#22c55e"),
  icon: z.string().default("BookMarked"),
  cover_url: z.string().nullable().optional(),
  is_favorite: z.boolean().optional(),
});

export const upsertPlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertPlaybookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    if (id) {
      const { data: row, error } = await context.supabase.from("strategy_playbooks")
        .update(fields).eq("id", id).eq("user_id", context.userId).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase.from("strategy_playbooks")
      .insert({ ...fields, user_id: context.userId }).select().single();
    if (error) throw error;
    return row;
  });

export const listPlaybooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("strategy_playbooks")
      .select("*, strategies(name, color, icon)")
      .eq("user_id", context.userId)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const deletePlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("strategy_playbooks").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

/* ================= Versions ================= */

export const listVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ strategy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("strategy_versions")
      .select("*").eq("strategy_id", data.strategy_id).eq("user_id", context.userId)
      .order("version", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ strategy_id: z.string().uuid(), version_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase.from("strategy_versions")
      .select("*").eq("id", data.version_id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!v) throw new Error("Version not found");
    const snap = v.snapshot as any;
    const { id, user_id, created_at, updated_at, ...restore } = snap;
    const { data: current } = await context.supabase.from("strategies").select("version")
      .eq("id", data.strategy_id).maybeSingle();
    const next = (current?.version ?? 1) + 1;
    const { error: e2 } = await context.supabase.from("strategies")
      .update({ ...restore, version: next }).eq("id", data.strategy_id).eq("user_id", context.userId);
    if (e2) throw e2;
    await context.supabase.from("strategy_history").insert({
      strategy_id: data.strategy_id, user_id: context.userId, action: "restore",
      detail: { restored_version: v.version, new_version: next },
    });
    return { ok: true };
  });

/* ================= Stats / Analytics ================= */

export const getStrategyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ strategy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: entries } = await context.supabase
      .from("journal_entries")
      .select("pnl, rr, opened_at, closed_at")
      .eq("user_id", context.userId)
      .eq("strategy_id", data.strategy_id);
    return computeStrategyStats(data.strategy_id, (entries ?? []) as any);
  });

export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: strategies }, { data: entries }] = await Promise.all([
      context.supabase.from("strategies").select("id, name, color, status, is_favorite").eq("user_id", context.userId),
      context.supabase.from("journal_entries").select("strategy_id, pnl, rr, opened_at, closed_at, symbol")
        .eq("user_id", context.userId).not("strategy_id", "is", null),
    ]);
    const byId = new Map<string, any>();
    for (const s of strategies ?? []) byId.set(s.id, { ...s, entries: [] as any[] });
    for (const e of entries ?? []) {
      const rec = byId.get(e.strategy_id!);
      if (rec) rec.entries.push(e);
    }
    const rows = [...byId.values()].map((r) => ({
      ...r,
      stats: computeStrategyStats(r.id, r.entries),
    }));
    const active = (strategies ?? []).filter((s) => s.status !== "archived").length;
    const totals = rows.reduce((acc, r) => {
      acc.trades += r.stats.trades;
      acc.pnl += r.stats.net_pnl;
      return acc;
    }, { trades: 0, pnl: 0 });
    const mostProfitable = rows.slice().sort((a, b) => b.stats.net_pnl - a.stats.net_pnl)[0] ?? null;
    const bestWinRate = rows.filter((r) => r.stats.trades >= 3).slice().sort((a, b) => b.stats.win_rate - a.stats.win_rate)[0] ?? null;
    const mostUsed = rows.slice().sort((a, b) => b.stats.trades - a.stats.trades)[0] ?? null;
    const avgRr = rows.length
      ? rows.reduce((s, r) => s + r.stats.avg_rr, 0) / rows.length : 0;
    return {
      total: (strategies ?? []).length, active,
      totals, avgRr, mostProfitable, bestWinRate, mostUsed,
      rows,
    };
  });

/* ================= Flow ================= */

export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    strategy_id: z.string().uuid(),
    nodes: z.array(z.object({
      id: z.string().optional(), node_type: z.string(), label: z.string().optional().nullable(),
      data: z.record(z.any()).default({}), pos_x: z.number(), pos_y: z.number(),
    })),
    edges: z.array(z.object({ source_id: z.string(), target_id: z.string(), label: z.string().optional().nullable() })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // simple replace-all strategy
    await context.supabase.from("strategy_flow_edges").delete().eq("strategy_id", data.strategy_id).eq("user_id", context.userId);
    await context.supabase.from("strategy_flow_nodes").delete().eq("strategy_id", data.strategy_id).eq("user_id", context.userId);
    if (data.nodes.length) {
      const ids = new Map<string, string>();
      const inserts = data.nodes.map((n) => ({
        strategy_id: data.strategy_id, user_id: context.userId,
        node_type: n.node_type, label: n.label ?? null,
        data: n.data, pos_x: n.pos_x, pos_y: n.pos_y,
      }));
      const { data: rows, error } = await context.supabase.from("strategy_flow_nodes").insert(inserts).select();
      if (error) throw error;
      data.nodes.forEach((n, i) => { if (n.id) ids.set(n.id, rows![i].id); });
      if (data.edges.length) {
        await context.supabase.from("strategy_flow_edges").insert(
          data.edges.map((e) => ({
            strategy_id: data.strategy_id, user_id: context.userId,
            source_id: ids.get(e.source_id) ?? e.source_id,
            target_id: ids.get(e.target_id) ?? e.target_id,
            label: e.label ?? null,
          })),
        );
      }
    }
    return { ok: true };
  });

export const getFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ strategy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      context.supabase.from("strategy_flow_nodes").select("*").eq("strategy_id", data.strategy_id).eq("user_id", context.userId),
      context.supabase.from("strategy_flow_edges").select("*").eq("strategy_id", data.strategy_id).eq("user_id", context.userId),
    ]);
    return { nodes: nodes ?? [], edges: edges ?? [] };
  });

/* ================= Search ================= */

export const searchStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const safe = escapeSearch(data.q, 200);
    if (!safe) return [];
    const q = `%${safe}%`;
    const { data: rows, error } = await context.supabase
      .from("strategies")
      .select("id,name,description,category,market,tags,color,icon,status")
      .eq("user_id", context.userId)
      .or(`name.ilike.${q},description.ilike.${q},notes.ilike.${q},category.ilike.${q},market.ilike.${q}`)
      .limit(25);
    if (error) throw error;
    return rows ?? [];
  });

/* ================= Import ================= */

export const importFromJSON = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ payload: z.record(z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = (data.payload as any).strategy ?? data.payload;
    const { data: row, error } = await context.supabase.from("strategies").insert({
      user_id: context.userId,
      name: s.name ?? "Imported Strategy",
      description: s.description ?? null,
      category: s.category ?? null,
      market: s.market ?? null,
      markets: s.markets ?? [],
      symbols: s.symbols ?? [],
      timeframes: s.timeframes ?? [],
      tags: s.tags ?? [],
      market_conditions: s.market_conditions ?? [],
      difficulty: s.difficulty ?? "intermediate",
      color: s.color ?? "#8b5cf6",
      icon: s.icon ?? "Sparkles",
      entry_rules: s.entry_rules ?? [],
      exit_rules: s.exit_rules ?? [],
      risk_rules: s.risk_rules ?? {},
      trade_management: s.trade_management ?? {},
      position_sizing: s.position_sizing ?? {},
      notes: s.notes ?? null,
      status: "draft",
    }).select().single();
    if (error) throw error;
    return row;
  });
