import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["risk", "profit_factor", "replay_hours", "journal", "consistency", "session", "replay", "win_rate", "custom"] as const;

export const listChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    scope: z.enum(["active", "upcoming", "ended", "all"]).default("active"),
    limit: z.number().min(1).max(50).default(24),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    let q = supabase.from("community_challenges").select("*").limit(data.limit);
    if (data.scope === "active") q = q.eq("status", "active").gte("end_at", now).order("end_at", { ascending: true });
    else if (data.scope === "upcoming") q = q.eq("status", "draft").gte("start_at", now).order("start_at", { ascending: true });
    else if (data.scope === "ended") q = q.in("status", ["ended", "cancelled"] as any).order("end_at", { ascending: false });
    else q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw error;
    // My entries for these
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: myEntries } = ids.length
      ? await supabase.from("community_challenge_entries").select("challenge_id, score, rank").eq("user_id", userId).in("challenge_id", ids)
      : { data: [] };
    const map = new Map((myEntries ?? []).map((e: any) => [e.challenge_id, e]));
    return { challenges: (rows ?? []).map((r: any) => ({ ...r, myEntry: map.get(r.id) ?? null })) };
  });

export const createChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
    title: z.string().min(2).max(160),
    description: z.string().max(4000).optional(),
    kind: z.enum(KINDS),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
    metric: z.any().optional(),
    rewards: z.any().optional(),
    visibility: z.enum(["public", "group", "private"]).default("public"),
    group_id: z.string().uuid().optional().nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase.from("community_challenges").insert({
      slug: data.slug, title: data.title, description: data.description ?? null,
      kind: data.kind, start_at: data.start_at, end_at: data.end_at,
      metric: data.metric ?? {}, rewards: data.rewards ?? {},
      visibility: data.visibility, group_id: data.group_id ?? null,
      created_by: userId, status: "active",
    } as any).select("id, slug").single();
    if (error) throw error;
    return { id: inserted.id, slug: inserted.slug };
  });

export const getChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ slug: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: challenge } = await supabase.from("community_challenges").select("*").eq("slug", data.slug).maybeSingle();
    if (!challenge) return { challenge: null };
    await computeChallengeScores(supabase, challenge);
    const { data: entries } = await supabase
      .from("community_challenge_entries")
      .select("user_id, score, rank, breakdown, joined_at")
      .eq("challenge_id", challenge.id)
      .order("rank", { ascending: true, nullsFirst: false })
      .limit(100);
    const ids = (entries ?? []).map((e: any) => e.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, country, level").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const leaderboard = (entries ?? []).map((e: any) => ({ ...e, profile: map.get(e.user_id) ?? null }));
    const myEntry = leaderboard.find((e) => e.user_id === userId) ?? null;
    return { challenge, leaderboard, myEntry };
  });

export const joinChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ challenge_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("community_challenge_entries").upsert({
      challenge_id: data.challenge_id, user_id: userId, score: 0,
    } as any, { onConflict: "challenge_id,user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const leaveChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ challenge_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("community_challenge_entries").delete().eq("challenge_id", data.challenge_id).eq("user_id", userId);
    return { ok: true };
  });

/**
 * Compute per-entry scores from real platform data based on challenge kind.
 * Runs at read time (cheap ranked update) rather than requiring pg_cron.
 */
async function computeChallengeScores(supabase: any, challenge: any) {
  const { data: entries } = await supabase
    .from("community_challenge_entries")
    .select("id, user_id, score")
    .eq("challenge_id", challenge.id);
  if (!entries?.length) return;
  const start = challenge.start_at;
  const end = challenge.end_at;
  const updates: { id: string; score: number; breakdown: any }[] = [];

  for (const e of entries) {
    let score = 0;
    let breakdown: any = {};
    if (["risk", "profit_factor", "consistency", "win_rate"].includes(challenge.kind)) {
      const { data: trades } = await supabase
        .from("paper_trades")
        .select("pnl, rr_realized, closed_at, status")
        .eq("user_id", e.user_id)
        .eq("status", "closed")
        .gte("closed_at", start)
        .lte("closed_at", end);
      const closed = trades ?? [];
      const wins = closed.filter((t: any) => (t.pnl ?? 0) > 0);
      const losses = closed.filter((t: any) => (t.pnl ?? 0) < 0);
      const grossW = wins.reduce((a: number, t: any) => a + (t.pnl ?? 0), 0);
      const grossL = Math.abs(losses.reduce((a: number, t: any) => a + (t.pnl ?? 0), 0));
      const wr = closed.length ? (wins.length / closed.length) * 100 : 0;
      const pf = grossL > 0 ? grossW / grossL : grossW;
      const avgRR = closed.length ? closed.reduce((a: number, t: any) => a + (t.rr_realized ?? 0), 0) / closed.length : 0;
      breakdown = { trades: closed.length, wins: wins.length, losses: losses.length, wr, pf, avgRR };
      if (challenge.kind === "profit_factor") score = Math.max(0, pf);
      else if (challenge.kind === "win_rate") score = wr;
      else if (challenge.kind === "risk") score = avgRR;
      else if (challenge.kind === "consistency") {
        // stddev-adjusted
        const dailyMap = new Map<string, number>();
        for (const t of closed) {
          const d = String(t.closed_at ?? "").slice(0, 10);
          dailyMap.set(d, (dailyMap.get(d) ?? 0) + (t.pnl ?? 0));
        }
        const arr = [...dailyMap.values()];
        const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const stdev = arr.length ? Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / arr.length) : 0;
        score = avg !== 0 ? Math.max(0, Math.min(100, 100 - (stdev / Math.abs(avg)) * 20)) : 0;
        breakdown.consistency = score;
      }
    } else if (challenge.kind === "replay_hours") {
      const { data: sessions } = await supabase
        .from("replay_sessions")
        .select("duration_seconds, updated_at")
        .eq("user_id", e.user_id)
        .gte("updated_at", start)
        .lte("updated_at", end);
      const seconds = (sessions ?? []).reduce((a: number, s: any) => a + (s.duration_seconds ?? 0), 0);
      score = seconds / 3600;
      breakdown = { hours: score };
    } else if (challenge.kind === "journal") {
      const { count } = await supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", e.user_id)
        .gte("created_at", start)
        .lte("created_at", end);
      score = count ?? 0;
      breakdown = { entries: score };
    } else if (challenge.kind === "session") {
      // Trades opened in the "London" (or metric-defined) session window
      const target = (challenge.metric?.session ?? "london").toLowerCase();
      const range: Record<string, [number, number]> = {
        london: [7, 15], newyork: [12, 20], asia: [23, 7], sydney: [21, 5],
      };
      const [h1, h2] = range[target] ?? [7, 15];
      const { data: trades } = await supabase
        .from("paper_trades")
        .select("pnl, opened_at, status")
        .eq("user_id", e.user_id)
        .eq("status", "closed")
        .gte("opened_at", start).lte("opened_at", end);
      const inSession = (trades ?? []).filter((t: any) => {
        const h = new Date(t.opened_at).getUTCHours();
        return h1 < h2 ? h >= h1 && h < h2 : h >= h1 || h < h2;
      });
      score = inSession.reduce((a: number, t: any) => a + (t.pnl ?? 0), 0);
      breakdown = { session: target, trades: inSession.length, pnl: score };
    } else if (challenge.kind === "replay") {
      const { data: rs } = await supabase
        .from("replay_scores").select("score").eq("user_id", e.user_id);
      const arr = (rs ?? []).map((r: any) => r.score ?? 0);
      score = arr.length ? Math.max(...arr) : 0;
      breakdown = { best: score, sessions: arr.length };
    }
    updates.push({ id: e.id, score: Number(score.toFixed(4)), breakdown });
  }

  // Write scores and rank
  const sorted = [...updates].sort((a, b) => b.score - a.score);
  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i];
    await supabase.from("community_challenge_entries").update({
      score: u.score, rank: i + 1, breakdown: u.breakdown, computed_at: new Date().toISOString(),
    }).eq("id", u.id);
  }
}
