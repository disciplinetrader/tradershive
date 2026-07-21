import { escapeSearch } from "@/lib/search-escape";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildExcerpt, extractHashtags, renderMarkdownSafe } from "@/lib/community/constants";

const POST_SELECT = `
  id, author_id, category_id, post_type, title, body_md, body_html, excerpt,
  symbol, market, direction, hashtags, media, poll, attachments,
  linked_trade_id, linked_journal_id, linked_replay_id, linked_strategy_id, linked_battle_id,
  is_pinned, is_featured, is_locked, visibility,
  like_count, comment_count, bookmark_count, share_count, view_count, helpful_count,
  trending_score, published_at, edited_at, created_at,
  category:community_categories(id, slug, name, color, icon),
  shared_content(id, source_type, source_id, source_ref, title, summary, snapshot, cover_url, visibility)
`;

/**
 * PostgREST cannot resolve `community_*.author_id -> profiles` embeds because
 * those FKs point at `auth.users`, not `public.profiles`. We fetch the profile
 * rows in a follow-up query and merge them in application code.
 */
async function attachAuthors<T extends Record<string, any>>(
  supabase: any,
  rows: T[],
  key: string = "author_id",
  as: string = "author",
  columns: string = "id, username, display_name, avatar_url, country, level, league",
): Promise<T[]> {
  if (!rows.length) return rows;
  const ids = Array.from(new Set(rows.map((r) => r[key]).filter(Boolean)));
  if (!ids.length) return rows.map((r) => ({ ...r, [as]: null }));
  const { data: profs } = await supabase.from("profiles").select(columns).in("id", ids);
  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, [as]: map.get(r[key]) ?? null }));
}


async function attachViewerState(
  supabase: any,
  userId: string | null,
  posts: any[],
) {
  if (!posts.length || !userId) return posts;
  const ids = posts.map((p) => p.id);
  const [likes, bookmarks] = await Promise.all([
    supabase.from("community_reactions").select("post_id, kind").eq("user_id", userId).in("post_id", ids),
    supabase.from("community_bookmarks").select("post_id").eq("user_id", userId).in("post_id", ids),
  ]);
  const likedByPost = new Map<string, Set<string>>();
  for (const r of likes.data ?? []) {
    if (!likedByPost.has(r.post_id)) likedByPost.set(r.post_id, new Set());
    likedByPost.get(r.post_id)!.add(r.kind);
  }
  const bookmarked = new Set((bookmarks.data ?? []).map((b: any) => b.post_id));
  return posts.map((p) => ({
    ...p,
    viewer_reactions: [...(likedByPost.get(p.id) ?? [])],
    viewer_bookmarked: bookmarked.has(p.id),
  }));
}

/* ------------------ Feed ------------------ */

const feedInput = z.object({
  tab: z.enum(["following", "trending", "latest", "battle_arena", "strategies", "journals", "education", "announcements"]).default("latest"),
  categorySlug: z.string().nullable().optional(),
  hashtag: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  authorId: z.string().uuid().nullable().optional(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().nullable().optional(),
});

export const listFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => feedInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let q = supabase
      .from("community_posts")
      .select(POST_SELECT)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .eq("is_draft", false)
      .limit(data.limit);

    if (data.tab === "trending") {
      q = q.order("trending_score", { ascending: false });
    } else if (data.tab === "following") {
      const { data: follows } = await supabase.from("social_follows").select("following_id").eq("follower_id", userId);
      const ids = (follows ?? []).map((f: any) => f.following_id);
      if (!ids.length) return { posts: [], nextCursor: null };
      q = q.in("author_id", ids).order("published_at", { ascending: false });
    } else if (data.tab === "battle_arena") {
      q = q.or("post_type.eq.battle_result,post_type.eq.tournament_result").order("published_at", { ascending: false });
    } else if (data.tab === "strategies") {
      q = q.eq("post_type", "strategy").order("published_at", { ascending: false });
    } else if (data.tab === "journals") {
      q = q.eq("post_type", "journal").order("published_at", { ascending: false });
    } else if (data.tab === "education") {
      q = q.order("published_at", { ascending: false });
      const { data: cats } = await supabase.from("community_categories").select("id").eq("slug", "education");
      if (cats?.[0]?.id) q = q.eq("category_id", cats[0].id);
    } else if (data.tab === "announcements") {
      q = q.eq("post_type", "announcement").order("published_at", { ascending: false });
    } else {
      q = q.order("published_at", { ascending: false });
    }

    if (data.categorySlug) {
      const { data: cat } = await supabase.from("community_categories").select("id").eq("slug", data.categorySlug).maybeSingle();
      if (cat?.id) q = q.eq("category_id", cat.id);
    }
    if (data.hashtag) q = q.contains("hashtags", [data.hashtag.toLowerCase()]);
    if (data.symbol) q = q.eq("symbol", data.symbol.toUpperCase());
    if (data.authorId) q = q.eq("author_id", data.authorId);
    if (data.cursor) q = q.lt("published_at", data.cursor);

    const { data: posts, error } = await q;
    if (error) throw error;
    const withAuthors = await attachAuthors(supabase, posts ?? []);
    const withState = await attachViewerState(supabase, userId, withAuthors);
    const nextCursor = posts && posts.length === data.limit ? posts[posts.length - 1].published_at : null;
    return { posts: withState, nextCursor };
  });

/* ------------------ Single post ------------------ */

export const getPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: post, error } = await supabase.from("community_posts").select(POST_SELECT).eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!post) return { post: null };
    await supabase.rpc("community_recompute_trending" as any, { _post_id: data.id } as any).then(() => {}, () => {});
    await supabase.from("community_posts").update({ view_count: (post.view_count ?? 0) + 1 }).eq("id", data.id);
    const [withAuthor] = await attachAuthors(supabase, [post]);
    const [withState] = await attachViewerState(supabase, userId, [withAuthor]);
    return { post: withState };
  });

/* ------------------ Create / Update / Delete ------------------ */

const createInput = z.object({
  post_type: z.string().default("text"),
  title: z.string().max(200).optional().nullable(),
  body_md: z.string().max(20000).default(""),
  category_slug: z.string().nullable().optional(),
  symbol: z.string().max(24).nullable().optional(),
  market: z.string().max(24).nullable().optional(),
  direction: z.string().max(8).nullable().optional(),
  visibility: z.enum(["public", "followers", "private"]).default("public"),
  media: z.array(z.any()).default([]),
  poll: z.any().optional().nullable(),
  attachments: z.array(z.any()).default([]),
  linked_trade_id: z.string().uuid().nullable().optional(),
  linked_journal_id: z.string().uuid().nullable().optional(),
  linked_replay_id: z.string().uuid().nullable().optional(),
  linked_strategy_id: z.string().uuid().nullable().optional(),
  linked_battle_id: z.string().uuid().nullable().optional(),
  is_draft: z.boolean().default(false),
});

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Per-user rate limit: 30 posts / hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 30) throw new Error("Rate limit: too many posts in the last hour. Please slow down.");

    let category_id: string | null = null;
    if (data.category_slug) {
      const { data: cat } = await supabase.from("community_categories").select("id").eq("slug", data.category_slug).maybeSingle();
      category_id = cat?.id ?? null;
    }

    const hashtags = extractHashtags((data.title ?? "") + " " + (data.body_md ?? ""));
    const body_html = renderMarkdownSafe(data.body_md ?? "");
    const excerpt = buildExcerpt(data.body_md ?? data.title ?? "");

    const row = {
      author_id: userId,
      category_id,
      post_type: data.post_type,
      title: data.title ?? null,
      body_md: data.body_md,
      body_html,
      excerpt,
      symbol: data.symbol ? data.symbol.toUpperCase() : null,
      market: data.market ?? null,
      direction: data.direction ?? null,
      hashtags,
      media: data.media,
      poll: data.poll ?? null,
      attachments: data.attachments,
      linked_trade_id: data.linked_trade_id ?? null,
      linked_journal_id: data.linked_journal_id ?? null,
      linked_replay_id: data.linked_replay_id ?? null,
      linked_strategy_id: data.linked_strategy_id ?? null,
      linked_battle_id: data.linked_battle_id ?? null,
      is_draft: data.is_draft,
      is_published: !data.is_draft,
      visibility: data.visibility,
      published_at: data.is_draft ? null : new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase.from("community_posts").insert(row as any).select("id").single();
    if (error) throw error;

    // Upsert hashtags
    for (const tag of hashtags) {
      await supabase.from("community_tags").upsert({ slug: tag, name: tag, post_count: 1 }, { onConflict: "slug", ignoreDuplicates: true });
    }
    await supabase.rpc("community_recompute_trending" as any, { _post_id: inserted.id } as any).then(() => {}, () => {});
    return { id: inserted.id };
  });

export const updatePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().max(200).optional().nullable(),
      body_md: z.string().max(20000).optional(),
      visibility: z.enum(["public", "followers", "private"]).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = { edited_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.visibility) patch.visibility = data.visibility;
    if (data.body_md !== undefined) {
      patch.body_md = data.body_md;
      patch.body_html = renderMarkdownSafe(data.body_md);
      patch.excerpt = buildExcerpt(data.body_md);
      patch.hashtags = extractHashtags((data.title ?? "") + " " + data.body_md);
    }
    const { error } = await supabase.from("community_posts").update(patch).eq("id", data.id).eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("community_posts").update({ is_deleted: true }).eq("id", data.id).eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------ Reactions / bookmarks ------------------ */

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      post_id: z.string().uuid().optional(),
      comment_id: z.string().uuid().optional(),
      kind: z.string().default("like"),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.post_id && !data.comment_id) throw new Error("post_id or comment_id required");
    const target = data.post_id ? { post_id: data.post_id, comment_id: null } : { post_id: null, comment_id: data.comment_id! };
    const { data: existing } = await supabase
      .from("community_reactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", data.kind as any)
      .match(target)
      .maybeSingle();
    if (existing) {
      await supabase.from("community_reactions").delete().eq("id", existing.id);
      return { active: false };
    }
    await supabase.from("community_reactions").insert({ user_id: userId, kind: data.kind, ...target } as any);
    return { active: true };
  });

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ post_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("community_bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", data.post_id)
      .maybeSingle();
    if (existing) {
      await supabase.from("community_bookmarks").delete().eq("id", existing.id);
      return { active: false };
    }
    await supabase.from("community_bookmarks").insert({ user_id: userId, post_id: data.post_id });
    return { active: true };
  });

export const listBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("community_bookmarks")
      .select(`id, created_at, post:community_posts(${POST_SELECT})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const posts = (data ?? []).map((r: any) => r.post).filter(Boolean);
    const withAuthors = await attachAuthors(supabase, posts);
    const withState = await attachViewerState(supabase, userId, withAuthors);
    return { posts: withState };
  });

/* ------------------ Comments ------------------ */

const COMMENT_SELECT = `
  id, post_id, parent_id, author_id, body_md, body_html, mentions,
  like_count, reply_count, is_edited, is_deleted, edited_at, created_at
`;

export const listComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ post_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("community_comments")
      .select(COMMENT_SELECT)
      .eq("post_id", data.post_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    const ids = (rows ?? []).map((r: any) => r.id);
    let liked = new Set<string>();
    if (ids.length) {
      const { data: my } = await supabase
        .from("community_reactions")
        .select("comment_id")
        .eq("user_id", userId)
        .in("comment_id", ids);
      liked = new Set((my ?? []).map((r: any) => r.comment_id));
    }
    const withAuthors = await attachAuthors(supabase, rows ?? []);
    return { comments: withAuthors.map((r: any) => ({ ...r, viewer_liked: liked.has(r.id) })) };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      post_id: z.string().uuid(),
      parent_id: z.string().uuid().nullable().optional(),
      body_md: z.string().min(1).max(4000),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // rate limit: 60 comments / hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("community_comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 60) throw new Error("Rate limit: too many comments in the last hour.");

    const body_html = renderMarkdownSafe(data.body_md);
    const { data: inserted, error } = await supabase
      .from("community_comments")
      .insert({
        post_id: data.post_id,
        parent_id: data.parent_id ?? null,
        author_id: userId,
        body_md: data.body_md,
        body_html,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_comments")
      .update({ is_deleted: true })
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------ Categories / trending / search ------------------ */

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("community_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { categories: data ?? [] };
  });

export const listTrending = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [postsRes, tradersRes, tagsRes] = await Promise.all([
      supabase
        .from("community_posts")
        .select("id, title, excerpt, post_type, symbol, like_count, comment_count, trending_score, published_at, author:profiles!community_posts_author_id_fkey(username, display_name, avatar_url)")
        .eq("is_published", true).eq("is_deleted", false)
        .order("trending_score", { ascending: false }).limit(6),
      supabase.from("community_reputation")
        .select("user_id, reputation_score, posts_count, likes_received, profile:profiles!community_reputation_user_id_fkey(username, display_name, avatar_url, country, level, league)")
        .order("reputation_score", { ascending: false }).limit(6),
      supabase.from("community_tags").select("slug, name, post_count").order("post_count", { ascending: false }).limit(10),
    ]);
    return {
      posts: postsRes.data ?? [],
      traders: tradersRes.data ?? [],
      tags: tagsRes.data ?? [],
    };
  });

export const searchCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ q: z.string().min(1).max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = escapeSearch(data.q);
    if (!q) return { posts: [], traders: [], tags: [] };
    const [posts, traders, tags] = await Promise.all([
      supabase.from("community_posts")
        .select("id, title, excerpt, published_at, symbol, post_type")
        .or(`title.ilike.%${q}%,body_md.ilike.%${q}%,symbol.ilike.%${q}%`)
        .eq("is_published", true).eq("is_deleted", false)
        .order("trending_score", { ascending: false }).limit(20),
      supabase.from("profiles").select("id, username, display_name, avatar_url, level")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(10),
      supabase.from("community_tags").select("slug, name, post_count")
        .ilike("slug", `%${q.toLowerCase()}%`).limit(10),
    ]);
    return { posts: posts.data ?? [], traders: traders.data ?? [], tags: tags.data ?? [] };
  });

/* ------------------ Reports ------------------ */

export const reportContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      post_id: z.string().uuid().nullable().optional(),
      comment_id: z.string().uuid().nullable().optional(),
      reason: z.string().min(2).max(120),
      details: z.string().max(1000).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.post_id && !data.comment_id) throw new Error("post_id or comment_id required");
    const { error } = await supabase.from("community_reports").insert({
      reporter_id: userId,
      post_id: data.post_id ?? null,
      comment_id: data.comment_id ?? null,
      reason: data.reason,
      details: data.details ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

/* ------------------ Notifications ------------------ */

export const listCommunityNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("community_notifications")
      .select("id, actor_id, kind, post_id, comment_id, message, is_read, created_at, actor:profiles!community_notifications_actor_id_fkey(username, display_name, avatar_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { items: data ?? [] };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("community_notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    return { ok: true };
  });

/* ------------------ Follow (uses shared social_follows + mirror) ------------------ */

export const communityFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You cannot follow yourself.");
    await supabase.from("social_follows").upsert({ follower_id: userId, following_id: data.userId }, { onConflict: "follower_id,following_id" });
    await supabase.from("community_followers").upsert({ follower_id: userId, following_id: data.userId }, { onConflict: "follower_id,following_id" });
    return { ok: true };
  });

export const communityUnfollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("social_follows").delete().eq("follower_id", userId).eq("following_id", data.userId);
    await supabase.from("community_followers").delete().eq("follower_id", userId).eq("following_id", data.userId);
    return { ok: true };
  });

/* ------------------ Profile summary ------------------ */

export const getCommunityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ username: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, country, level, league, xp")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) return { profile: null };
    const [{ data: rep }, { count: followers }, { count: following }, { data: posts }] = await Promise.all([
      supabase.from("community_reputation").select("*").eq("user_id", profile.id).maybeSingle(),
      supabase.from("social_follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
      supabase.from("social_follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
      supabase.from("community_posts").select(POST_SELECT).eq("author_id", profile.id).eq("is_published", true).eq("is_deleted", false).order("published_at", { ascending: false }).limit(20),
    ]);
    return {
      profile,
      reputation: rep ?? null,
      followers: followers ?? 0,
      following: following ?? 0,
      posts: posts ?? [],
    };
  });
