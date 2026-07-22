import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IDEA_SELECT = `
  id, author_id, post_id, symbol, market, direction, timeframe,
  entry, stop_loss, take_profit, rr, chart_url, tv_url,
  replay_session_id, journal_entry_id, strategy_id, tags, notes,
  status, pnl_pct, visibility, closed_at, created_at, updated_at
`;

async function attachAuthors(supabase: any, rows: any[]) {
  if (!rows.length) return rows;
  const ids = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean)));
  const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url, level, league").in("id", ids);
  const map = new Map((data ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, author: map.get(r.author_id) ?? null }));
}

const listInput = z.object({
  status: z.enum(["all", "open", "closed", "win", "loss", "cancelled"]).default("all"),
  symbol: z.string().nullable().optional(),
  direction: z.enum(["long", "short"]).nullable().optional(),
  tag: z.string().nullable().optional(),
  authorId: z.string().uuid().nullable().optional(),
  limit: z.number().min(1).max(50).default(24),
  cursor: z.string().nullable().optional(),
});

export const listIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => listInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("trade_ideas").select(IDEA_SELECT).order("created_at", { ascending: false }).limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.symbol) q = q.eq("symbol", data.symbol.toUpperCase());
    if (data.direction) q = q.eq("direction", data.direction);
    if (data.tag) q = q.contains("tags", [data.tag.toLowerCase()]);
    if (data.authorId) q = q.eq("author_id", data.authorId);
    if (data.cursor) q = q.lt("created_at", data.cursor);
    const { data: rows, error } = await q;
    if (error) throw error;
    const ideas = await attachAuthors(supabase, rows ?? []);
    const nextCursor = rows && rows.length === data.limit ? rows[rows.length - 1].created_at : null;
    return { ideas, nextCursor };
  });

export const getIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: idea, error } = await supabase.from("trade_ideas").select(IDEA_SELECT).eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!idea) return { idea: null };
    const [withAuthor] = await attachAuthors(supabase, [idea]);
    return { idea: withAuthor };
  });

const createInput = z.object({
  symbol: z.string().min(1).max(24),
  market: z.string().max(24).nullable().optional(),
  direction: z.enum(["long", "short"]),
  timeframe: z.string().max(16).nullable().optional(),
  entry: z.number().nullable().optional(),
  stop_loss: z.number().nullable().optional(),
  take_profit: z.number().nullable().optional(),
  rr: z.number().nullable().optional(),
  chart_url: z.string().url().max(500).nullable().optional().or(z.literal("")),
  tv_url: z.string().url().max(500).nullable().optional().or(z.literal("")),
  replay_session_id: z.string().uuid().nullable().optional(),
  journal_entry_id: z.string().uuid().nullable().optional(),
  strategy_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
  notes: z.string().max(4000).optional().nullable(),
  visibility: z.enum(["public", "followers", "private"]).default("public"),
});

export const createIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Auto R:R if entry/sl/tp provided
    let rr = data.rr ?? null;
    if (rr == null && data.entry != null && data.stop_loss != null && data.take_profit != null) {
      const risk = Math.abs(data.entry - data.stop_loss);
      const reward = Math.abs(data.take_profit - data.entry);
      if (risk > 0) rr = Number((reward / risk).toFixed(2));
    }
    const row = {
      author_id: userId,
      symbol: data.symbol.toUpperCase(),
      market: data.market ?? null,
      direction: data.direction,
      timeframe: data.timeframe ?? null,
      entry: data.entry ?? null,
      stop_loss: data.stop_loss ?? null,
      take_profit: data.take_profit ?? null,
      rr,
      chart_url: data.chart_url || null,
      tv_url: data.tv_url || null,
      replay_session_id: data.replay_session_id ?? null,
      journal_entry_id: data.journal_entry_id ?? null,
      strategy_id: data.strategy_id ?? null,
      tags: data.tags.map((t) => t.toLowerCase()),
      notes: data.notes ?? null,
      visibility: data.visibility,
    };
    const { data: inserted, error } = await supabase.from("trade_ideas").insert(row as any).select("id, post_id").single();
    if (error) throw error;
    return { id: inserted.id, post_id: inserted.post_id };
  });

const closeInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["closed", "win", "loss", "cancelled"]),
  pnl_pct: z.number().nullable().optional(),
});

export const closeIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => closeInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("trade_ideas")
      .update({ status: data.status, pnl_pct: data.pnl_pct ?? null, closed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("trade_ideas").delete().eq("id", data.id).eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });
