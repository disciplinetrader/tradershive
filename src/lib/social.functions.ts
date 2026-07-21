import { escapeSearch } from "@/lib/search-escape";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aggregateTrades, statsFromAgg, categoryValue, type UserStats } from "@/lib/social/calculations";
import { RANKING_CATEGORIES, type RankingCategory } from "@/lib/social/constants";

/* ------------------ helpers ------------------ */

type SupabaseCtx = { supabase: any; userId: string };

async function loadUserAggregates(
  supabase: any,
  userIds: string[],
): Promise<Map<string, UserStats & { achievements: number; journalScore: number; challengeScore: number }>> {
  const map = new Map<string, UserStats & { achievements: number; journalScore: number; challengeScore: number }>();
  if (userIds.length === 0) return map;

  const [tradesRes, journalRes, achRes, chalRes] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("user_id, pnl, rr, closed_at")
      .in("user_id", userIds)
      .eq("status", "closed"),
    supabase
      .from("journal_entries")
      .select("user_id, grade, followed_plan, pnl")
      .in("user_id", userIds),
    supabase.from("user_achievements").select("user_id").in("user_id", userIds),
    supabase
      .from("user_challenges")
      .select("user_id, status, challenges(difficulty)")
      .in("user_id", userIds)
      .eq("status", "completed"),
  ]);

  const grouped = new Map<string, { trades: any[]; journal: any[]; ach: number; chal: any[] }>();
  for (const id of userIds) grouped.set(id, { trades: [], journal: [], ach: 0, chal: [] });
  for (const t of tradesRes.data ?? []) grouped.get(t.user_id)?.trades.push(t);
  for (const j of journalRes.data ?? []) grouped.get(j.user_id)?.journal.push(j);
  for (const a of achRes.data ?? []) { const g = grouped.get(a.user_id); if (g) g.ach += 1; }
  for (const c of chalRes.data ?? []) grouped.get(c.user_id)?.chal.push(c);

  const diffWeight: Record<string, number> = { easy: 1, medium: 2, hard: 4, elite: 8 };

  for (const [id, g] of grouped) {
    const agg = aggregateTrades(g.trades, g.journal);
    const planCount = g.journal.filter((j) => j.followed_plan != null).length;
    const stats = statsFromAgg(agg, planCount);
    const gradeToNum: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const journalScore = g.journal.reduce((sum, j) => sum + (gradeToNum[String(j.grade ?? "")] ?? 0), 0);
    const challengeScore = g.chal.reduce((sum, c) => sum + (diffWeight[String(c.challenges?.difficulty ?? "easy")] ?? 1), 0);
    map.set(id, { ...stats, achievements: g.ach, journalScore, challengeScore });
  }
  return map;
}

function sortByCategoryDesc<T extends { value: number }>(rows: T[]) {
  return rows.slice().sort((a, b) => b.value - a.value);
}

/* ------------------ leaderboard ------------------ */

const leaderboardInput = z.object({
  category: z.string().default("xp"),
  scope: z.enum(["global", "friends", "country", "league"]).default("global"),
  scopeValue: z.string().nullable().optional(),
  filters: z.object({
    country: z.string().nullable().optional(),
    league: z.string().nullable().optional(),
    market: z.string().nullable().optional(),
    tradingStyle: z.string().nullable().optional(),
    experience: z.string().nullable().optional(),
    search: z.string().nullable().optional(),
  }).default({}),
  limit: z.number().min(1).max(200).default(100),
});

export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => leaderboardInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as SupabaseCtx;
    const { supabase, userId } = ctx;
    const cat = (RANKING_CATEGORIES.find((c) => c.key === data.category)?.key ?? "xp") as RankingCategory;

    let q = supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, country, league, level, xp, streak")
      .eq("onboarded", true);

    if (data.filters.country) q = q.eq("country", data.filters.country);
    if (data.filters.league) q = q.eq("league", data.filters.league);
    if (data.filters.tradingStyle) q = q.eq("trading_style", data.filters.tradingStyle);
    if (data.filters.experience) q = q.eq("experience", data.filters.experience);
    if (data.filters.market) q = q.eq("preferred_market", data.filters.market);
    if (data.filters.search) q = q.ilike("username", `%${data.filters.search}%`);

    if (data.scope === "country" && data.scopeValue) q = q.eq("country", data.scopeValue);
    if (data.scope === "league" && data.scopeValue) q = q.eq("league", data.scopeValue);

    if (data.scope === "friends") {
      const { data: follows } = await supabase
        .from("social_follows")
        .select("following_id")
        .eq("follower_id", userId);
      const ids = [userId, ...(follows ?? []).map((f: any) => f.following_id)];
      q = q.in("id", ids);
    }

    // Exclude opted-out users
    const { data: hidden } = await supabase
      .from("profile_privacy")
      .select("user_id")
      .or("eligible_for_leaderboard.eq.false,hide_profile.eq.true");
    const hiddenIds = new Set((hidden ?? []).map((r: any) => r.user_id));

    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    const eligibleProfiles = (rows ?? []).filter((r: any) => !hiddenIds.has(r.id));
    const userIds = eligibleProfiles.map((p: any) => p.id);

    // XP/Streak paths don't need trade aggregates; other categories do
    const aggMap = ["xp", "streak"].includes(cat)
      ? new Map()
      : await loadUserAggregates(supabase, userIds);

    const catDef = RANKING_CATEGORIES.find((c) => c.key === cat)!;

    const enriched = eligibleProfiles.map((p: any) => {
      const s = aggMap.get(p.id);
      const stats: UserStats & { achievements: number; journalScore: number; challengeScore: number } =
        s ?? { totalTrades: 0, winRate: 0, profitFactor: 0, netR: 0, profit: 0, avgRR: 0, consistency: 0, discipline: 0, achievements: 0, journalScore: 0, challengeScore: 0 };
      const value = categoryValue(cat, p, stats, stats);
      const meetsMin = !catDef.minTrades || stats.totalTrades >= catDef.minTrades;
      return { profile: p, stats, value: meetsMin ? value : -Infinity };
    }).filter((r: any) => r.value !== -Infinity);

    const sorted = sortByCategoryDesc(enriched)
      .slice(0, data.limit)
      .map((r: any, i: number) => ({ rank: i + 1, ...r }));

    // Find current user's rank (may be outside top N)
    const me = enriched
      .slice()
      .sort((a: any, b: any) => b.value - a.value)
      .findIndex((r: any) => r.profile.id === userId);
    const myRank = me >= 0 ? me + 1 : null;

    return { rows: sorted, category: cat, myRank, total: enriched.length };
  });

/* ------------------ my ranking summary ------------------ */

export const getMyRankingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const { data: me } = await supabase
      .from("profiles")
      .select("xp, league, country")
      .eq("id", userId)
      .maybeSingle();

    const { count: globalRank } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("xp", me?.xp ?? 0);

    // Weekly snapshot lookup
    const { data: snaps } = await supabase
      .from("leaderboard_snapshots")
      .select("period, period_key, rank, taken_at")
      .eq("user_id", userId)
      .eq("category", "xp")
      .eq("scope", "global")
      .order("taken_at", { ascending: false })
      .limit(20);

    const nowRank = (globalRank ?? 0) + 1;
    const findPrev = (period: string) => (snaps ?? []).find((s: any) => s.period === period)?.rank ?? null;
    const weeklyPrev = findPrev("weekly");
    const monthlyPrev = findPrev("monthly");
    return {
      currentRank: nowRank,
      weeklyDelta: weeklyPrev != null ? weeklyPrev - nowRank : null,
      monthlyDelta: monthlyPrev != null ? monthlyPrev - nowRank : null,
    };
  });

/* ------------------ follow system ------------------ */

const idInput = z.object({ userId: z.string().uuid() });

export const followUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    if (data.userId === userId) throw new Error("Cannot follow yourself");
    const { error } = await supabase
      .from("social_follows")
      .upsert({ follower_id: userId, following_id: data.userId }, { onConflict: "follower_id,following_id" });
    if (error) throw error;
    return { ok: true };
  });

export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const { error } = await supabase
      .from("social_follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getFollowState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const [{ data: rel }, { count: followers }, { count: following }] = await Promise.all([
      supabase.from("social_follows").select("id").eq("follower_id", userId).eq("following_id", data.userId).maybeSingle(),
      supabase.from("social_follows").select("id", { count: "exact", head: true }).eq("following_id", data.userId),
      supabase.from("social_follows").select("id", { count: "exact", head: true }).eq("follower_id", data.userId),
    ]);
    return { isFollowing: !!rel, followers: followers ?? 0, following: following ?? 0 };
  });

/* ------------------ public profile ------------------ */

const usernameInput = z.object({ username: z.string().min(1) });

export const getPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => usernameInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, country, level, xp, coins, league, streak, bio, experience, preferred_market, trading_style, preferred_markets, created_at")
      .eq("username", data.username)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error("Not found");

    const [customRes, privRes, achRes, followers, following, myFollow, viewsRes] = await Promise.all([
      supabase.from("profile_customization").select("*").eq("user_id", profile.id).maybeSingle(),
      supabase.from("profile_privacy").select("*").eq("user_id", profile.id).maybeSingle(),
      supabase.from("user_achievements").select("id, achievement_id, unlocked_at, achievements(name, description, icon, category, rarity, xp_reward)").eq("user_id", profile.id),
      supabase.from("social_follows").select("id", { count: "exact", head: true }).eq("following_id", profile.id),
      supabase.from("social_follows").select("id", { count: "exact", head: true }).eq("follower_id", profile.id),
      supabase.from("social_follows").select("id").eq("follower_id", userId).eq("following_id", profile.id).maybeSingle(),
      supabase.from("profile_views").select("id", { count: "exact", head: true }).eq("profile_id", profile.id),
    ]);

    const privacy = privRes.data ?? { hide_profile: false, hide_stats: false, hide_journal: true, hide_activity: false, show_country: true, show_league: true, eligible_for_leaderboard: true };
    if (privacy.hide_profile && userId !== profile.id) throw new Error("Profile is private");

    // Aggregate stats
    let stats: any = null;
    if (!privacy.hide_stats || userId === profile.id) {
      const map = await loadUserAggregates(supabase, [profile.id]);
      stats = map.get(profile.id) ?? null;
    }

    // Global rank by XP
    const { count: rankAhead } = await supabase
      .from("profiles").select("id", { count: "exact", head: true }).gt("xp", profile.xp);

    // Record a view (don't fail on error, don't view own)
    if (userId !== profile.id) {
      await supabase.from("profile_views").insert({ profile_id: profile.id, viewer_id: userId }).then(() => {}, () => {});
    }

    return {
      profile,
      customization: customRes.data ?? null,
      privacy,
      achievements: achRes.data ?? [],
      followers: followers.count ?? 0,
      following: following.count ?? 0,
      isFollowing: !!myFollow.data,
      isSelf: userId === profile.id,
      views: viewsRes.count ?? 0,
      stats,
      globalRank: (rankAhead ?? 0) + 1,
    };
  });

/* ------------------ activity timeline ------------------ */

export const getProfileActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid(), limit: z.number().default(30) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context as SupabaseCtx;
    const [xps, ach, trades, chal] = await Promise.all([
      supabase.from("xp_transactions").select("id, amount, reason, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(data.limit),
      supabase.from("user_achievements").select("id, unlocked_at, achievements(name, icon)").eq("user_id", data.userId).order("unlocked_at", { ascending: false }).limit(data.limit),
      supabase.from("paper_trades").select("id, symbol, pnl, direction, closed_at").eq("user_id", data.userId).eq("status", "closed").order("closed_at", { ascending: false }).limit(data.limit),
      supabase.from("user_challenges").select("id, completed_at, challenges(name)").eq("user_id", data.userId).eq("status", "completed").order("completed_at", { ascending: false }).limit(data.limit),
    ]);

    type Item = { kind: string; at: string; title: string; sub?: string; icon?: string | null; value?: number | null };
    const items: Item[] = [];
    for (const x of xps.data ?? []) items.push({ kind: "xp", at: x.created_at, title: `+${x.amount} XP`, sub: x.reason ?? "" });
    for (const a of ach.data ?? []) if (a.unlocked_at) items.push({ kind: "achievement", at: a.unlocked_at, title: `Unlocked: ${a.achievements?.name ?? "Achievement"}`, icon: a.achievements?.icon ?? null });
    for (const t of trades.data ?? []) if (t.closed_at) items.push({ kind: "trade", at: t.closed_at, title: `${t.direction.toUpperCase()} ${t.symbol}`, value: t.pnl });
    for (const c of chal.data ?? []) if (c.completed_at) items.push({ kind: "challenge", at: c.completed_at, title: `Completed: ${c.challenges?.name ?? "Challenge"}` });
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items.slice(0, data.limit);
  });

/* ------------------ users search ------------------ */

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    q: z.string().default(""),
    country: z.string().nullable().optional(),
    league: z.string().nullable().optional(),
    market: z.string().nullable().optional(),
    tradingStyle: z.string().nullable().optional(),
    sort: z.enum(["xp", "newest", "rank", "streak"]).default("xp"),
    limit: z.number().max(50).default(24),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as SupabaseCtx;
    let q = supabase.from("profiles").select("id, username, display_name, avatar_url, country, league, level, xp, streak, trading_style, preferred_market, created_at").eq("onboarded", true);
    if (data.q) { const s = escapeSearch(data.q); if (s) q = q.or(`username.ilike.%${s}%,display_name.ilike.%${s}%`); }
    if (data.country) q = q.eq("country", data.country);
    if (data.league) q = q.eq("league", data.league);
    if (data.market) q = q.eq("preferred_market", data.market);
    if (data.tradingStyle) q = q.eq("trading_style", data.tradingStyle);
    q = data.sort === "newest"
      ? q.order("created_at", { ascending: false })
      : data.sort === "streak"
      ? q.order("streak", { ascending: false })
      : q.order("xp", { ascending: false });
    const { data: rows, error } = await q.limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

/* ------------------ compare traders ------------------ */

export const compareTraders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ a: z.string(), b: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context as SupabaseCtx;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, xp, level, league, country, streak")
      .in("username", [data.a, data.b]);
    if (!profs || profs.length < 2) throw new Error("Users not found");
    const map = await loadUserAggregates(supabase, profs.map((p: any) => p.id));
    return profs.map((p: any) => ({ profile: p, stats: map.get(p.id) ?? null }));
  });

/* ------------------ country rankings ------------------ */

export const getCountryRankings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as SupabaseCtx;
    const { data: rows } = await supabase
      .from("profiles")
      .select("country, xp")
      .eq("onboarded", true)
      .not("country", "is", null);
    const groups = new Map<string, { count: number; totalXp: number }>();
    for (const r of rows ?? []) {
      if (!r.country) continue;
      const g = groups.get(r.country) ?? { count: 0, totalXp: 0 };
      g.count += 1;
      g.totalXp += r.xp ?? 0;
      groups.set(r.country, g);
    }
    const out = Array.from(groups.entries()).map(([country, g]) => ({
      country,
      traders: g.count,
      totalXp: g.totalXp,
      avgXp: Math.round(g.totalXp / g.count),
    })).sort((a, b) => b.totalXp - a.totalXp).map((r, i) => ({ ...r, rank: i + 1 }));
    return out;
  });

/* ------------------ customization + privacy ------------------ */

export const updateCustomization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    banner_url: z.string().nullable().optional(),
    headline: z.string().max(140).nullable().optional(),
    favorite_pair: z.string().max(40).nullable().optional(),
    website: z.string().max(200).nullable().optional(),
    discord_handle: z.string().max(80).nullable().optional(),
    x_handle: z.string().max(80).nullable().optional(),
    telegram_handle: z.string().max(80).nullable().optional(),
    youtube_url: z.string().max(200).nullable().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const { error } = await supabase
      .from("profile_customization")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const updatePrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    hide_profile: z.boolean().optional(),
    hide_stats: z.boolean().optional(),
    hide_journal: z.boolean().optional(),
    hide_activity: z.boolean().optional(),
    show_country: z.boolean().optional(),
    show_league: z.boolean().optional(),
    eligible_for_leaderboard: z.boolean().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const { error } = await supabase
      .from("profile_privacy")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const getMyPrivacy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as SupabaseCtx;
    const [{ data: priv }, { data: cust }] = await Promise.all([
      supabase.from("profile_privacy").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profile_customization").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    return { privacy: priv, customization: cust };
  });
