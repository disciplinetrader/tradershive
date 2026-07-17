import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
 * Dashboard layout (widget visibility + collapsed state)
 * ==========================================================*/

export type DashboardLayout = {
  hidden: string[];
  collapsed: string[];
  updatedAt?: string;
};

export const DEFAULT_LAYOUT: DashboardLayout = { hidden: [], collapsed: [] };

export const getDashboardLayout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dashboard_layouts")
      .select("layout, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const layout = (data?.layout as Partial<DashboardLayout> | null) ?? null;
    return {
      hidden: Array.isArray(layout?.hidden) ? (layout!.hidden as string[]) : [],
      collapsed: Array.isArray(layout?.collapsed) ? (layout!.collapsed as string[]) : [],
      updatedAt: data?.updated_at ?? null,
    };
  });

const layoutSchema = z.object({
  hidden: z.array(z.string()).default([]),
  collapsed: z.array(z.string()).default([]),
});

export const saveDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => layoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dashboard_layouts")
      .upsert(
        { user_id: context.userId, layout: data },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
 * Quick notes
 * ==========================================================*/

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quick_notes")
      .select("*")
      .eq("user_id", context.userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

const noteInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(120).default(""),
  content: z.string().max(5000).default(""),
  color: z.string().max(20).default("emerald"),
  pinned: z.boolean().default(false),
});

export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => noteInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    if (data.id) {
      const { error } = await context.supabase
        .from("quick_notes")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("quick_notes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quick_notes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
 * Watchlists
 * ==========================================================*/

export const listWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Ensure a default watchlist exists
    let { data: lists, error } = await context.supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!lists || lists.length === 0) {
      const { data: created, error: cErr } = await context.supabase
        .from("watchlists")
        .insert({ user_id: context.userId, name: "My Watchlist", market: "forex", is_default: true })
        .select("*")
        .single();
      if (cErr) throw cErr;
      lists = [created];
    }
    const listIds = lists.map((l) => l.id);
    const { data: items, error: iErr } = await context.supabase
      .from("watchlist_items")
      .select("*")
      .in("watchlist_id", listIds)
      .order("favorite", { ascending: false })
      .order("sort_order", { ascending: true });
    if (iErr) throw iErr;
    return { lists, items: items ?? [] };
  });

const addItemInput = z.object({
  watchlist_id: z.string().uuid(),
  symbol: z.string().min(1).max(20),
  market: z.string().min(1).max(20),
});

export const addWatchlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watchlist_items").upsert(
      {
        watchlist_id: data.watchlist_id,
        user_id: context.userId,
        symbol: data.symbol.toUpperCase(),
        market: data.market,
      },
      { onConflict: "watchlist_id,symbol" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const removeWatchlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watchlist_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleWatchlistFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), favorite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watchlist_items")
      .update({ favorite: data.favorite })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
