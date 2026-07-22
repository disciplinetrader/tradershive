import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `g-${Date.now().toString(36)}`;
}

const createInput = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
  visibility: z.enum(["public", "private", "invite"]).default("public"),
  tags: z.array(z.string().max(24)).max(8).default([]),
  avatar_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  banner_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
});

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const base = slugify(data.name);
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const { data: exists } = await supabase.from("study_groups").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${base}-${i}`;
    }
    const { data: inserted, error } = await supabase.from("study_groups").insert({
      slug, name: data.name, description: data.description ?? null,
      visibility: data.visibility, tags: data.tags.map((t) => t.toLowerCase()),
      avatar_url: data.avatar_url || null, banner_url: data.banner_url || null,
      owner_id: userId, member_count: 1,
    } as any).select("id, slug").single();
    if (error) throw error;
    await supabase.from("study_group_members").insert({ group_id: inserted.id, user_id: userId, role: "owner" } as any);
    return { id: inserted.id, slug: inserted.slug };
  });

export const listGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    q: z.string().max(80).optional(),
    scope: z.enum(["discover", "mine"]).default("discover"),
    limit: z.number().min(1).max(50).default(30),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.scope === "mine") {
      const { data: mine } = await supabase.from("study_group_members").select("group_id, role, joined_at").eq("user_id", userId);
      const ids = (mine ?? []).map((m: any) => m.group_id);
      if (!ids.length) return { groups: [] };
      const { data: groups } = await supabase.from("study_groups").select("*").in("id", ids);
      return { groups: groups ?? [] };
    }
    let q = supabase.from("study_groups").select("*").neq("visibility", "private").order("member_count", { ascending: false }).limit(data.limit);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { groups: rows ?? [] };
  });

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ slug: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: group } = await supabase.from("study_groups").select("*").eq("slug", data.slug).maybeSingle();
    if (!group) return { group: null };
    const { data: members } = await supabase.from("study_group_members").select("user_id, role, joined_at").eq("group_id", group.id).order("joined_at", { ascending: true }).limit(200);
    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profs } = memberIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", memberIds)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const isMember = (members ?? []).some((m: any) => m.user_id === userId);
    return {
      group,
      isMember,
      isOwner: group.owner_id === userId,
      members: (members ?? []).map((m: any) => ({ ...m, profile: map.get(m.user_id) ?? null })),
    };
  });

export const joinGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ group_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: g } = await supabase.from("study_groups").select("visibility").eq("id", data.group_id).maybeSingle();
    if (!g) throw new Error("Group not found");
    if (g.visibility === "invite") throw new Error("Invite-only group");
    const { error } = await supabase.from("study_group_members").upsert({
      group_id: data.group_id, user_id: userId, role: "member",
    } as any, { onConflict: "group_id,user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ group_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("study_group_members").delete().eq("group_id", data.group_id).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const listGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    group_id: z.string().uuid(),
    limit: z.number().min(1).max(200).default(80),
    before: z.string().nullable().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("study_group_messages").select("id, group_id, user_id, body, attachments, reply_to, created_at")
      .eq("group_id", data.group_id).order("created_at", { ascending: false }).limit(data.limit);
    if (data.before) q = q.lt("created_at", data.before);
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const messages = (rows ?? []).reverse().map((m: any) => ({ ...m, author: map.get(m.user_id) ?? null }));
    const nextBefore = rows && rows.length === data.limit ? rows[rows.length - 1].created_at : null;
    return { messages, nextBefore };
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    group_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
    reply_to: z.string().uuid().nullable().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase.from("study_group_messages").insert({
      group_id: data.group_id, user_id: userId, body: data.body, reply_to: data.reply_to ?? null,
    } as any).select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const listGroupResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ group_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("study_group_resources").select("*").eq("group_id", data.group_id).order("created_at", { ascending: false });
    if (error) throw error;
    return { resources: rows ?? [] };
  });

export const addGroupResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    group_id: z.string().uuid(),
    kind: z.enum(["replay", "journal", "idea", "challenge", "strategy", "note", "link"]),
    ref_id: z.string().uuid().nullable().optional(),
    title: z.string().max(200).optional(),
    note: z.string().max(2000).optional(),
    url: z.string().url().max(500).optional().or(z.literal("")),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase.from("study_group_resources").insert({
      group_id: data.group_id, added_by: userId, kind: data.kind,
      ref_id: data.ref_id ?? null, title: data.title ?? null, note: data.note ?? null, url: data.url || null,
    } as any).select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  });
