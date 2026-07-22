import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createInput = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(4000).optional(),
  instrument: z.string().max(24).optional().nullable(),
  session_type: z.enum(["analysis", "review", "q_and_a", "workshop", "live_trade"]).default("analysis"),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional().nullable(),
  stream_url: z.string().url().max(500).optional().or(z.literal("")).nullable(),
  group_id: z.string().uuid().optional().nullable(),
  visibility: z.enum(["public", "group", "private"]).default("public"),
});

export const createLiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase.from("live_sessions").insert({
      host_id: userId,
      title: data.title,
      description: data.description ?? null,
      instrument: data.instrument ?? null,
      session_type: data.session_type,
      start_at: data.start_at,
      end_at: data.end_at ?? null,
      stream_url: data.stream_url || null,
      group_id: data.group_id ?? null,
      visibility: data.visibility,
    } as any).select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const listLiveSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    scope: z.enum(["upcoming", "live", "past", "mine"]).default("upcoming"),
    limit: z.number().min(1).max(50).default(30),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    let q = supabase.from("live_sessions").select("*").limit(data.limit);
    if (data.scope === "upcoming") q = q.eq("status", "scheduled").gte("start_at", now).order("start_at", { ascending: true });
    else if (data.scope === "live") q = q.eq("status", "live").order("start_at", { ascending: true });
    else if (data.scope === "past") q = q.in("status", ["ended", "cancelled"] as any).order("start_at", { ascending: false });
    else q = q.eq("host_id", userId).order("start_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.host_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return { sessions: (rows ?? []).map((r: any) => ({ ...r, host: map.get(r.host_id) ?? null })) };
  });

export const getLiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase.from("live_sessions").select("*").eq("id", data.id).maybeSingle();
    if (!session) return { session: null };
    const [{ data: host }, { data: rsvp }, { data: attendees }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", session.host_id).maybeSingle(),
      supabase.from("live_session_attendees").select("rsvp").eq("session_id", data.id).eq("user_id", userId).maybeSingle(),
      supabase.from("live_session_attendees").select("user_id, rsvp").eq("session_id", data.id).limit(50),
    ]);
    return { session: { ...session, host, myRsvp: rsvp?.rsvp ?? null, attendees: attendees ?? [] } };
  });

export const rsvpLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    session_id: z.string().uuid(),
    rsvp: z.enum(["going", "maybe", "declined"]),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("live_session_attendees").upsert({
      session_id: data.session_id, user_id: userId, rsvp: data.rsvp,
    } as any, { onConflict: "session_id,user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const updateLiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional(),
    replay_url: z.string().url().max(500).optional().or(z.literal("")).nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.status) patch.status = data.status;
    if (data.replay_url !== undefined) patch.replay_url = data.replay_url || null;
    const { error } = await supabase.from("live_sessions").update(patch).eq("id", data.id).eq("host_id", userId);
    if (error) throw error;
    return { ok: true };
  });
