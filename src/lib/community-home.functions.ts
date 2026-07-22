import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Community Home dashboard aggregator.
 * Returns pinned announcements, recent posts, popular trade ideas,
 * top contributors, active challenges, upcoming live sessions,
 * recent achievements, trending tags and topline stats.
 */
export const getCommunityHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [
      pinnedRes, postsRes, ideasRes, contribRes, challengesRes, sessionsRes, achRes, tagsRes,
      postsCountRes, ideasCountRes, groupsCountRes,
    ] = await Promise.all([
      supabase.from("community_posts")
        .select("id, author_id, title, excerpt, post_type, published_at")
        .eq("is_pinned", true).eq("is_published", true).eq("is_deleted", false)
        .order("published_at", { ascending: false }).limit(3),
      supabase.from("community_posts")
        .select("id, author_id, title, excerpt, post_type, symbol, like_count, comment_count, trending_score, published_at")
        .eq("is_published", true).eq("is_deleted", false)
        .order("published_at", { ascending: false }).limit(8),
      supabase.from("trade_ideas")
        .select("id, author_id, symbol, direction, timeframe, rr, status, created_at")
        .eq("visibility", "public")
        .in("status", ["open", "win"] as any)
        .order("created_at", { ascending: false }).limit(6),
      supabase.from("community_reputation")
        .select("user_id, reputation_score, posts_count, likes_received")
        .order("reputation_score", { ascending: false }).limit(6),
      supabase.from("community_challenges")
        .select("id, slug, title, kind, end_at, participant_count")
        .eq("status", "active").gte("end_at", now)
        .order("end_at", { ascending: true }).limit(4),
      supabase.from("live_sessions")
        .select("id, host_id, title, instrument, session_type, start_at, status, attendee_count")
        .in("status", ["scheduled", "live"] as any).gte("start_at", now)
        .order("start_at", { ascending: true }).limit(4),
      supabase.from("user_achievements")
        .select("user_id, achievement_id, unlocked_at")
        .order("unlocked_at", { ascending: false }).limit(6),
      supabase.from("community_tags").select("slug, name, post_count")
        .order("post_count", { ascending: false }).limit(10),
      supabase.from("community_posts").select("id", { count: "exact", head: true }).gte("published_at", dayAgo).eq("is_published", true).eq("is_deleted", false),
      supabase.from("trade_ideas").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("study_groups").select("id", { count: "exact", head: true }),
    ]);

    // Attach author profiles for the various rows
    const allAuthorIds = new Set<string>();
    for (const r of [pinnedRes.data ?? [], postsRes.data ?? [], ideasRes.data ?? [], sessionsRes.data ?? [], achRes.data ?? []].flat()) {
      const id = (r as any).author_id ?? (r as any).host_id ?? (r as any).user_id;
      if (id) allAuthorIds.add(id);
    }
    for (const c of contribRes.data ?? []) allAuthorIds.add((c as any).user_id);

    const { data: profiles } = allAuthorIds.size
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, level, league").in("id", [...allAuthorIds])
      : { data: [] };
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const withAuthor = (rows: any[], key = "author_id") =>
      rows.map((r) => ({ ...r, author: pmap.get(r[key]) ?? null }));

    // Achievements meta
    const achIds = Array.from(new Set((achRes.data ?? []).map((a: any) => a.achievement_id)));
    const { data: achMeta } = achIds.length
      ? await supabase.from("achievements").select("id, name, description, icon, category, rarity").in("id", achIds)
      : { data: [] };
    const amap = new Map((achMeta ?? []).map((a: any) => [a.id, a]));

    return {
      pinned: withAuthor(pinnedRes.data ?? []),
      recentPosts: withAuthor(postsRes.data ?? []),
      popularIdeas: withAuthor(ideasRes.data ?? []),
      topContributors: (contribRes.data ?? []).map((c: any) => ({ ...c, profile: pmap.get(c.user_id) ?? null })),
      activeChallenges: challengesRes.data ?? [],
      upcomingSessions: withAuthor(sessionsRes.data ?? [], "host_id"),
      recentAchievements: (achRes.data ?? []).map((a: any) => ({
        ...a,
        profile: pmap.get(a.user_id) ?? null,
        achievement: amap.get(a.achievement_id) ?? null,
      })),
      tags: tagsRes.data ?? [],
      stats: {
        postsToday: postsCountRes.count ?? 0,
        openIdeas: ideasCountRes.count ?? 0,
        studyGroups: groupsCountRes.count ?? 0,
      },
    };
  });
