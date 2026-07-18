import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildExcerpt, extractHashtags, renderMarkdownSafe } from "@/lib/community/constants";
import { buildShareSnapshot, type ShareSourceType } from "@/lib/sharing/snapshot.server";

const SOURCE_ENUM = z.enum([
  "trading_workspace", "journal", "battle", "championship", "replay",
  "strategy", "statistics", "ai_review", "achievement", "challenge", "profile", "custom",
]);

/* ---------- Preview: build snapshot without publishing ---------- */
export const previewShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      source_type: SOURCE_ENUM,
      source_id: z.string().uuid().nullable().optional(),
      source_ref: z.string().nullable().optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const snap = await buildShareSnapshot(
      context.supabase, context.userId,
      data.source_type as ShareSourceType,
      data.source_id ?? null, data.source_ref ?? null,
    );
    return snap;
  });

/* ---------- Publish: create community post + shared_content row ---------- */
const publishInput = z.object({
  source_type: SOURCE_ENUM,
  source_id: z.string().uuid().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  title: z.string().max(200).optional().nullable(),
  note: z.string().max(20000).default(""),
  tags: z.array(z.string()).default([]),
  category_slug: z.string().nullable().optional(),
  visibility: z.enum(["public", "followers", "private", "draft"]).default("public"),
  cover_url: z.string().nullable().optional(),
  assets: z.array(z.object({
    kind: z.enum(["image", "chart", "pdf", "video", "link"]),
    url: z.string(),
    caption: z.string().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
  })).default([]),
});

export const publishShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => publishInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // rate limit reuse: 30 posts/hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("community_posts").select("id", { count: "exact", head: true })
      .eq("author_id", userId).gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 30) throw new Error("Rate limit: too many posts in the last hour.");

    // Rebuild snapshot server-side (never trust client). This also re-verifies ownership.
    const snap = await buildShareSnapshot(
      supabase, userId,
      data.source_type as ShareSourceType,
      data.source_id ?? null, data.source_ref ?? null,
    );

    const finalTitle = (data.title ?? snap.title ?? "").trim() || null;
    const body_md = data.note ?? "";
    const combinedTags = Array.from(new Set([
      ...extractHashtags(body_md + " " + (finalTitle ?? "")),
      ...snap.tags, ...data.tags.map((t) => t.replace(/^#/, "").toLowerCase()),
    ])).slice(0, 12);

    // Resolve category
    let category_id: string | null = null;
    const categorySlug = data.category_slug ?? snap.category;
    if (categorySlug) {
      const { data: cat } = await supabase.from("community_categories").select("id").eq("slug", categorySlug).maybeSingle();
      category_id = cat?.id ?? null;
    }

    // Create the community post (only when visibility != "draft" do we publish)
    const isDraft = data.visibility === "draft";
    const postVisibility = isDraft ? "private" : data.visibility;
    const excerpt = buildExcerpt(body_md || snap.summary);
    const postRow = {
      author_id: userId,
      category_id,
      post_type: snap.postType,
      title: finalTitle,
      body_md,
      body_html: renderMarkdownSafe(body_md),
      excerpt,
      symbol: snap.symbol ? snap.symbol.toUpperCase() : null,
      market: snap.market, direction: snap.direction,
      hashtags: combinedTags,
      media: snap.cover ? [{ kind: "image", url: snap.cover }] : [],
      attachments: [],
      ...snap.linked,
      is_draft: isDraft, is_published: !isDraft, visibility: postVisibility,
      published_at: isDraft ? null : new Date().toISOString(),
    };
    const { data: post, error: perr } = await supabase.from("community_posts").insert(postRow as any).select("id").single();
    if (perr) throw perr;

    // Persist tags
    for (const tag of combinedTags) {
      await supabase.from("community_tags").upsert({ slug: tag, name: tag, post_count: 1 }, { onConflict: "slug", ignoreDuplicates: true });
    }

    // Create shared_content row
    const { data: share, error: serr } = await supabase.from("shared_content").insert({
      user_id: userId,
      post_id: post.id,
      source_type: data.source_type,
      source_id: data.source_id ?? null,
      source_ref: data.source_ref ?? null,
      title: finalTitle,
      summary: snap.summary,
      snapshot: snap.snapshot as any,
      cover_url: data.cover_url ?? snap.cover ?? null,
      visibility: data.visibility,
    } as any).select("id").single();
    if (serr) throw serr;

    // Assets
    if (data.assets.length) {
      await supabase.from("shared_content_assets").insert(
        data.assets.map((a, i) => ({ ...a, content_id: share.id, sort_order: i })) as any,
      );
    }

    // Backlinks
    const linkRows: any[] = [];
    for (const [k, v] of Object.entries(snap.linked)) {
      if (!v) continue;
      const target =
        k === "linked_trade_id" ? "journal" :
        k === "linked_journal_id" ? "journal" :
        k === "linked_battle_id" ? "battle" :
        k === "linked_replay_id" ? "replay" :
        k === "linked_strategy_id" ? "strategy" : "custom";
      linkRows.push({ content_id: share.id, target_type: target, target_id: v });
    }
    if (linkRows.length) await supabase.from("shared_content_links").insert(linkRows as any);

    // Event
    await supabase.from("share_events").insert({
      content_id: share.id, post_id: post.id, user_id: userId,
      event_type: "created", source_type: data.source_type,
    } as any);

    // Trending recompute (fire and forget)
    await supabase.rpc("community_recompute_trending" as any, { _post_id: post.id } as any).then(() => {}, () => {});

    return { post_id: post.id, share_id: share.id };
  });

/* ---------- Analytics for the current user ---------- */
export const listMyShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shared_content")
      .select("id, post_id, source_type, source_id, title, summary, cover_url, visibility, created_at")
      .eq("user_id", context.userId).eq("is_removed", false)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { shares: data ?? [] };
  });

export const recordShareEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      content_id: z.string().uuid().nullable().optional(),
      post_id: z.string().uuid().nullable().optional(),
      event_type: z.enum(["viewed", "clicked", "liked", "bookmarked", "reshared"]),
      metadata: z.record(z.any()).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("share_events").insert({
      content_id: data.content_id ?? null,
      post_id: data.post_id ?? null,
      user_id: context.userId,
      event_type: data.event_type,
      metadata: data.metadata ?? {},
    } as any);
    return { ok: true };
  });
