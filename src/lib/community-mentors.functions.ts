import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  headline: z.string().max(160).optional().nullable(),
  bio: z.string().max(4000).optional().nullable(),
  specialties: z.array(z.string().max(40)).max(12).default([]),
  markets: z.array(z.string().max(24)).max(12).default([]),
  languages: z.array(z.string().max(8)).max(8).default(["en"]),
  hourly_rate: z.number().nullable().optional(),
  active: z.boolean().default(true),
});

export const upsertMentorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = { user_id: userId, ...data };
    const { error } = await supabase.from("mentor_profiles").upsert(row as any, { onConflict: "user_id" });
    if (error) throw error;
    // Flag reputation.is_mentor
    await supabase.from("community_reputation").upsert({ user_id: userId, is_mentor: true } as any, { onConflict: "user_id" });
    return { ok: true };
  });

export const getMyMentorProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("mentor_profiles").select("*").eq("user_id", userId).maybeSingle();
    return { profile: data ?? null };
  });

export const listMentors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    q: z.string().max(80).optional(),
    market: z.string().max(24).optional(),
    limit: z.number().min(1).max(50).default(24),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("mentor_profiles").select("*").eq("active", true).order("rating", { ascending: false }).limit(data.limit);
    if (data.market) q = q.contains("markets", [data.market]);
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r: any) => r.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, country, level, league").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    let mentors = (rows ?? []).map((m: any) => ({ ...m, profile: map.get(m.user_id) ?? null }));
    if (data.q) {
      const s = data.q.toLowerCase();
      mentors = mentors.filter((m) =>
        (m.headline ?? "").toLowerCase().includes(s) ||
        (m.bio ?? "").toLowerCase().includes(s) ||
        (m.profile?.username ?? "").toLowerCase().includes(s) ||
        (m.profile?.display_name ?? "").toLowerCase().includes(s)
      );
    }
    return { mentors };
  });

export const requestMentorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    mentor_id: z.string().uuid(),
    message: z.string().max(2000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.mentor_id === userId) throw new Error("You can't mentor yourself.");
    const { data: inserted, error } = await supabase.from("mentor_assignments").insert({
      mentor_id: data.mentor_id,
      mentee_id: userId,
      status: "pending",
      message: data.message ?? null,
    } as any).select("id").single();
    if (error) throw error;
    await supabase.from("community_notifications").insert({
      user_id: data.mentor_id,
      actor_id: userId,
      kind: "mentor_feedback" as any,
      message: "requested mentorship",
    } as any);
    return { id: inserted.id };
  });

export const respondMentorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["accept", "decline", "end", "pause"]),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {
      accept: { status: "active", started_at: new Date().toISOString() },
      decline: { status: "declined" },
      end: { status: "ended", ended_at: new Date().toISOString() },
      pause: { status: "paused" },
    }[data.action];
    const { error } = await supabase.from("mentor_assignments").update(patch)
      .eq("id", data.id)
      .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`);
    if (error) throw error;
    return { ok: true };
  });

export const listMyMentorships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("mentor_assignments")
      .select("*")
      .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = Array.from(new Set([
      ...(rows ?? []).map((r: any) => r.mentor_id),
      ...(rows ?? []).map((r: any) => r.mentee_id),
    ]));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return {
      asMentor: (rows ?? []).filter((r: any) => r.mentor_id === userId).map((r: any) => ({ ...r, mentee: map.get(r.mentee_id) })),
      asMentee: (rows ?? []).filter((r: any) => r.mentee_id === userId).map((r: any) => ({ ...r, mentor: map.get(r.mentor_id) })),
    };
  });

export const assignHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    assignment_id: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().max(4000).optional(),
    due_at: z.string().datetime().optional().nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: a } = await supabase.from("mentor_assignments").select("mentor_id, mentee_id, status").eq("id", data.assignment_id).maybeSingle();
    if (!a || a.mentor_id !== userId) throw new Error("Not authorized");
    if (a.status !== "active") throw new Error("Assignment not active");
    const { data: inserted, error } = await supabase.from("mentor_homework").insert({
      assignment_id: data.assignment_id,
      mentor_id: userId,
      mentee_id: a.mentee_id,
      title: data.title,
      description: data.description ?? null,
      due_at: data.due_at ?? null,
    } as any).select("id").single();
    if (error) throw error;
    await supabase.from("community_notifications").insert({
      user_id: a.mentee_id,
      actor_id: userId,
      kind: "homework_assigned" as any,
      message: `assigned homework: ${data.title}`,
    } as any);
    return { id: inserted.id };
  });

export const listHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ assignment_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("mentor_homework").select("*").eq("assignment_id", data.assignment_id).order("created_at", { ascending: false });
    if (error) throw error;
    return { homework: rows ?? [] };
  });

export const updateHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["assigned", "submitted", "reviewed", "completed", "skipped"]).optional(),
    submission: z.any().optional(),
    feedback: z.string().max(4000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.status) patch.status = data.status;
    if (data.submission !== undefined) patch.submission = data.submission;
    if (data.feedback !== undefined) patch.feedback = data.feedback;
    const { error } = await supabase.from("mentor_homework").update(patch)
      .eq("id", data.id)
      .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`);
    if (error) throw error;
    return { ok: true };
  });
