import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const battleIdOnly = z.object({ battleId: z.string().uuid() });

/* ---------------- Chat ---------------- */

export const listBattleChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid(), limit: z.number().int().positive().max(200).default(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("battle_chat")
      .select("*")
      .eq("battle_id", data.battleId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds)
      : { data: [] as any[] };
    return { messages: (rows ?? []).reverse(), profiles: profiles ?? [] };
  });

export const sendBattleChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      battleId: z.string().uuid(),
      message: z.string().trim().min(1).max(500),
      mentions: z.array(z.string().uuid()).max(10).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("battle_chat")
      .insert({
        battle_id: data.battleId,
        user_id: context.userId,
        message: data.message,
        mentions: data.mentions ?? [],
        kind: "user",
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteBattleChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("battle_chat")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.messageId);
    if (error) throw error;
    return { ok: true };
  });

export const reactBattleChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      messageId: z.string().uuid(),
      emoji: z.string().min(1).max(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("battle_chat")
      .select("reactions")
      .eq("id", data.messageId)
      .maybeSingle();
    const reactions = (row?.reactions ?? {}) as Record<string, string[]>;
    const users = new Set(reactions[data.emoji] ?? []);
    if (users.has(context.userId)) users.delete(context.userId);
    else users.add(context.userId);
    reactions[data.emoji] = Array.from(users);
    if (reactions[data.emoji].length === 0) delete reactions[data.emoji];
    const { error } = await context.supabase
      .from("battle_chat")
      .update({ reactions })
      .eq("id", data.messageId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------- Events / Activity ---------------- */

export const listBattleEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ battleId: z.string().uuid(), limit: z.number().int().positive().max(200).default(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("battle_events")
      .select("*")
      .eq("battle_id", data.battleId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id, username, display_name, avatar_url, country").in("id", userIds)
      : { data: [] as any[] };
    return { events: rows ?? [], profiles: profiles ?? [] };
  });

/* ---------------- Live stats ---------------- */

export const getBattleLiveStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => battleIdOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("battle_statistics_live")
      .select("*")
      .eq("battle_id", data.battleId)
      .maybeSingle();
    if (!row) {
      // Ensure a row exists on first read.
      await context.supabase.rpc("recompute_battle_live_stats", { _battle_id: data.battleId });
      const { data: fresh } = await context.supabase
        .from("battle_statistics_live").select("*").eq("battle_id", data.battleId).maybeSingle();
      return fresh ?? null;
    }
    return row;
  });

/* ---------------- Presence ---------------- */

const presenceSchema = z.object({
  battleId: z.string().uuid(),
  status: z.enum(["trading", "watching", "idle", "disconnected", "finished"]).default("watching"),
  role: z.enum(["spectator", "participant", "host"]).default("spectator"),
});

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => presenceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("battle_presence")
      .upsert(
        {
          battle_id: data.battleId,
          user_id: context.userId,
          status: data.status,
          role: data.role,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "battle_id,user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const listBattlePresence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => battleIdOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("battle_presence")
      .select("*")
      .eq("battle_id", data.battleId);
    return rows ?? [];
  });

export const leavePresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => battleIdOnly.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("battle_presence")
      .delete()
      .eq("battle_id", data.battleId)
      .eq("user_id", context.userId);
    return { ok: true };
  });
