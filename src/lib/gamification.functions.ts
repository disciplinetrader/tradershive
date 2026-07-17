import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyXp, dailyRewardFor, leagueForLevel } from "./gamification/constants";
import { periodEndsAt, periodKeyForScope } from "./gamification/period";

/* ============================================================
 * Types
 * ==========================================================*/
type ChallengeRow = {
  id: string; slug: string; title: string; description: string;
  scope: string; category: string; difficulty: string; metric: string;
  target: number; xp_reward: number; coin_reward: number; icon: string | null;
  estimated_minutes: number | null; sort_order: number; active: boolean;
};

type UcRow = {
  id: string; user_id: string; challenge_id: string; progress: number;
  status: string; period_key: string; completed_at: string | null;
  claimed_at: string | null; expires_at: string | null;
};

/* ============================================================
 * Metric computation — real progress from the DB, no mocks.
 * ==========================================================*/
async function computeMetric(
  supabase: any,
  userId: string,
  metric: string,
  target: number,
): Promise<number> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const weekStart = (() => {
    const d = new Date(dayStart);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString();
  })();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const countTrades = async (from: string) => {
    const { count } = await supabase
      .from("paper_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("opened_at", from);
    return count ?? 0;
  };
  const countJournal = async (from: string) => {
    const { count } = await supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", from);
    return count ?? 0;
  };

  switch (metric) {
    case "paper_trades_today":  return countTrades(dayStart);
    case "paper_trades_week":   return countTrades(weekStart);
    case "paper_trades_month":  return countTrades(monthStart);
    case "journal_entries_today":  return countJournal(dayStart);
    case "journal_entries_week":   return countJournal(weekStart);
    case "total_trades":  return countTrades("1970-01-01");
    case "total_journal_entries": return countJournal("1970-01-01");
    case "total_wins": {
      const { count } = await supabase.from("paper_trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "closed").gt("pnl", 0);
      return count ?? 0;
    }
    case "weekly_r_gain": {
      const { data } = await supabase.from("journal_entries")
        .select("rr").eq("user_id", userId).gte("closed_at", weekStart);
      const sum = (data ?? []).reduce((a: number, r: any) => a + (Number(r.rr) || 0), 0);
      return Math.max(0, Math.round(sum * 100) / 100);
    }
    case "total_r": {
      const { data } = await supabase.from("journal_entries").select("rr").eq("user_id", userId);
      const sum = (data ?? []).reduce((a: number, r: any) => a + (Number(r.rr) || 0), 0);
      return Math.round(sum * 100) / 100;
    }
    case "login_streak":
    case "challenges_completed": {
      const { data } = await supabase.from("gamification_stats")
        .select("login_streak,total_challenges_completed").eq("user_id", userId).maybeSingle();
      if (!data) return 0;
      return metric === "login_streak"
        ? Number(data.login_streak ?? 0)
        : Number(data.total_challenges_completed ?? 0);
    }
    case "reviewed_yesterday":
    case "no_revenge_today":
    case "trades_at_1pct_today":
    case "trades_at_1pct":
    case "max_daily_trades_week":
    case "journaled_every_trade_month":
    case "perfect_week":
    case "perfect_month":
    case "london_session_trades":
    case "ny_session_trades":
    case "prop_firm_completed":
    case "diamond_hands":
    default:
      return 0;
  }
  void target;
}

/* ============================================================
 * Sync — refresh user_challenges progress + auto-complete
 * ==========================================================*/
async function syncChallengesInternal(supabase: any, userId: string) {
  // Load active challenges
  const { data: challenges } = await supabase
    .from("challenges").select("*").eq("active", true).order("sort_order");
  if (!challenges) return;

  for (const ch of challenges as ChallengeRow[]) {
    const periodKey = periodKeyForScope(ch.scope);
    const expires = periodEndsAt(ch.scope);
    // upsert user_challenge for this period
    const { data: existing } = await supabase
      .from("user_challenges")
      .select("id,status,progress,completed_at,claimed_at")
      .eq("user_id", userId).eq("challenge_id", ch.id).eq("period_key", periodKey)
      .maybeSingle();

    const progress = await computeMetric(supabase, userId, ch.metric, ch.target);
    const isComplete = progress >= ch.target;

    if (!existing) {
      await supabase.from("user_challenges").insert({
        user_id: userId, challenge_id: ch.id, period_key: periodKey,
        progress, status: isComplete ? "completed" : "active",
        completed_at: isComplete ? new Date().toISOString() : null,
        expires_at: expires?.toISOString() ?? null,
      });
    } else if (existing.status !== "claimed") {
      const patch: any = { progress };
      if (isComplete && existing.status !== "completed") {
        patch.status = "completed";
        patch.completed_at = new Date().toISOString();
      }
      await supabase.from("user_challenges")
        .update(patch).eq("id", existing.id);
    }
  }
}

export const syncChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await syncChallengesInternal(context.supabase, context.userId);
    return { ok: true };
  });

/* ============================================================
 * List challenges + progress
 * ==========================================================*/
export const listChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ scope: z.string().optional() }).parse(i ?? {}))
  .handler(async ({ context, data }) => {
    await syncChallengesInternal(context.supabase, context.userId);
    let q = context.supabase.from("challenges").select("*").eq("active", true);
    if (data.scope) q = q.eq("scope", data.scope);
    const { data: challenges } = await q.order("sort_order");
    const { data: userProgress } = await context.supabase
      .from("user_challenges").select("*").eq("user_id", context.userId);

    return (challenges ?? []).map((c: ChallengeRow) => {
      const pk = periodKeyForScope(c.scope);
      const uc = (userProgress ?? []).find(
        (u: UcRow) => u.challenge_id === c.id && u.period_key === pk);
      return {
        ...c,
        period_key: pk,
        expires_at: periodEndsAt(c.scope)?.toISOString() ?? null,
        user: uc
          ? { id: uc.id, progress: Number(uc.progress), status: uc.status,
              completed_at: uc.completed_at, claimed_at: uc.claimed_at }
          : { id: null, progress: 0, status: "active", completed_at: null, claimed_at: null },
      };
    });
  });

/* ============================================================
 * Claim reward
 * ==========================================================*/
export const claimChallengeReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ user_challenge_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: uc, error } = await context.supabase
      .from("user_challenges").select("*, challenges(*)")
      .eq("id", data.user_challenge_id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!uc) throw new Error("Not found");
    if (uc.status !== "completed") throw new Error("Challenge not completed");
    if (uc.claimed_at) throw new Error("Already claimed");
    const ch = uc.challenges as ChallengeRow;

    // Award xp + coins
    const result = await awardXpCoins(context.supabase, context.userId, {
      xp: ch.xp_reward, coins: ch.coin_reward,
      source: "challenge", source_id: ch.id,
      reason: `Challenge: ${ch.title}`,
    });

    await context.supabase.from("user_challenges")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", uc.id);

    // bump total completed
    await context.supabase.rpc("noop"); // placeholder if we had rpc
    const { data: stats } = await context.supabase
      .from("gamification_stats").select("total_challenges_completed")
      .eq("user_id", context.userId).maybeSingle();
    await context.supabase.from("gamification_stats").upsert({
      user_id: context.userId,
      total_challenges_completed: (Number(stats?.total_challenges_completed ?? 0) + 1),
    }, { onConflict: "user_id" });

    return { ok: true, ...result, challenge: { title: ch.title, icon: ch.icon } };
  });

/* ============================================================
 * Award XP + Coins helper (writes txs + updates profile)
 * ==========================================================*/
async function awardXpCoins(supabase: any, userId: string,
  args: { xp: number; coins: number; source: string; source_id?: string | null; reason: string }) {
  const { data: profile } = await supabase
    .from("profiles").select("xp,level,coins,league").eq("id", userId).maybeSingle();
  const currentXp = Number(profile?.xp ?? 0);
  const currentLevel = Math.max(1, Number(profile?.level ?? 1));
  const currentCoins = Number(profile?.coins ?? 0);

  const { level, xp, leveledUp } = applyXp(currentLevel, currentXp, args.xp);
  const newLeague = leagueForLevel(level);
  const newCoins = Math.max(0, currentCoins + args.coins);

  await supabase.from("profiles").update({
    xp, level, coins: newCoins, league: newLeague,
  }).eq("id", userId);

  if (args.xp !== 0) {
    await supabase.from("xp_transactions").insert({
      user_id: userId, delta: args.xp, reason: args.reason,
      source: args.source, source_id: args.source_id ?? null,
      balance_after: xp, level_after: level,
    });
  }
  if (args.coins !== 0) {
    await supabase.from("coin_transactions").insert({
      user_id: userId, delta: args.coins, reason: args.reason,
      source: args.source, source_id: args.source_id ?? null,
      balance_after: newCoins,
    });
  }

  return { xp_earned: args.xp, coins_earned: args.coins, level, xp, coins: newCoins,
           league: newLeague, leveledUp };
}

/* ============================================================
 * Daily login claim
 * ==========================================================*/
export const claimDailyLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    const { data: existing } = await context.supabase.from("daily_claims")
      .select("id").eq("user_id", context.userId).eq("claim_date", today).maybeSingle();
    if (existing) return { alreadyClaimed: true };

    const { data: stats } = await context.supabase
      .from("gamification_stats").select("*").eq("user_id", context.userId).maybeSingle();
    const lastDate = stats?.last_login_date as string | null;
    const streak = lastDate === yesterday ? Number(stats?.login_streak ?? 0) + 1
                 : lastDate === today ? Number(stats?.login_streak ?? 0)
                 : 1;
    const dayIndex = ((streak - 1) % 7) + 1;
    const reward = dailyRewardFor(dayIndex);

    await context.supabase.from("daily_claims").insert({
      user_id: context.userId, claim_date: today, day_index: dayIndex,
      xp_reward: reward.xp, coin_reward: reward.coins,
    });
    await context.supabase.from("gamification_stats").upsert({
      user_id: context.userId,
      login_streak: streak,
      best_login_streak: Math.max(Number(stats?.best_login_streak ?? 0), streak),
      last_login_date: today,
    }, { onConflict: "user_id" });
    await context.supabase.from("profiles").update({ streak }).eq("id", context.userId);

    const awarded = await awardXpCoins(context.supabase, context.userId, {
      xp: reward.xp, coins: reward.coins, source: "login",
      reason: `Daily login day ${dayIndex}`,
    });
    return { alreadyClaimed: false, dayIndex, streak, ...awarded };
  });

export const getDailyClaimStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: today_claim }, { data: last7 }, { data: stats }] = await Promise.all([
      context.supabase.from("daily_claims").select("*")
        .eq("user_id", context.userId).eq("claim_date", today).maybeSingle(),
      context.supabase.from("daily_claims").select("claim_date,day_index,xp_reward,coin_reward")
        .eq("user_id", context.userId).order("claim_date", { ascending: false }).limit(7),
      context.supabase.from("gamification_stats").select("*")
        .eq("user_id", context.userId).maybeSingle(),
    ]);
    return {
      claimedToday: !!today_claim,
      streak: Number(stats?.login_streak ?? 0),
      bestStreak: Number(stats?.best_login_streak ?? 0),
      recent: last7 ?? [],
    };
  });

/* ============================================================
 * Achievements
 * ==========================================================*/
export const listAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: catalog } = await context.supabase
      .from("achievements").select("*").eq("active", true).order("sort_order");
    const { data: mine } = await context.supabase
      .from("user_achievements").select("*").eq("user_id", context.userId);

    const result: any[] = [];
    for (const a of catalog ?? []) {
      const progress = await computeMetric(context.supabase, context.userId, a.metric, a.target);
      const existing = (mine ?? []).find((m: any) => m.achievement_id === a.id);
      const unlocked = progress >= Number(a.target);

      // Persist unlocks
      if (unlocked && !existing?.unlocked_at) {
        if (existing) {
          await context.supabase.from("user_achievements")
            .update({ unlocked_at: new Date().toISOString(), progress })
            .eq("id", existing.id);
        } else {
          await context.supabase.from("user_achievements").insert({
            user_id: context.userId, achievement_id: a.id,
            progress, unlocked_at: new Date().toISOString(),
          });
        }
        await awardXpCoins(context.supabase, context.userId, {
          xp: Number(a.xp_reward), coins: Number(a.coin_reward),
          source: "achievement", source_id: a.id,
          reason: `Achievement: ${a.title}`,
        });
      } else if (existing && Number(existing.progress) !== progress) {
        await context.supabase.from("user_achievements")
          .update({ progress }).eq("id", existing.id);
      }

      result.push({
        ...a,
        progress,
        unlocked,
        unlocked_at: existing?.unlocked_at ?? (unlocked ? new Date().toISOString() : null),
      });
    }
    return result;
  });

/* ============================================================
 * Badges
 * ==========================================================*/
export const listBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: catalog }, { data: mine }] = await Promise.all([
      context.supabase.from("badges").select("*").eq("active", true),
      context.supabase.from("user_badges").select("*").eq("user_id", context.userId),
    ]);
    const owned = new Set((mine ?? []).map((m: any) => m.badge_id));
    return (catalog ?? []).map((b: any) => ({
      ...b, earned: owned.has(b.id),
      earned_at: (mine ?? []).find((m: any) => m.badge_id === b.id)?.earned_at ?? null,
    }));
  });

/* ============================================================
 * Reward history (xp + coin txs merged)
 * ==========================================================*/
export const listRewardsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: xp }, { data: coins }] = await Promise.all([
      context.supabase.from("xp_transactions").select("*")
        .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(100),
      context.supabase.from("coin_transactions").select("*")
        .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(100),
    ]);
    return {
      xp: xp ?? [],
      coins: coins ?? [],
    };
  });

export const listChallengeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_challenges")
      .select("*, challenges(title,icon,category,difficulty,xp_reward,coin_reward,scope)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

/* ============================================================
 * Gamification overview (for widgets/profile)
 * ==========================================================*/
export const getGamificationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: stats }, { data: badges }, { data: ach }] = await Promise.all([
      context.supabase.from("profiles").select("level,xp,coins,league,streak").eq("id", context.userId).maybeSingle(),
      context.supabase.from("gamification_stats").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_badges").select("id").eq("user_id", context.userId),
      context.supabase.from("user_achievements").select("id").eq("user_id", context.userId).not("unlocked_at", "is", null),
    ]);
    return {
      profile: profile ?? { level: 1, xp: 0, coins: 0, league: "bronze", streak: 0 },
      stats: stats ?? {},
      badges_count: badges?.length ?? 0,
      achievements_count: ach?.length ?? 0,
    };
  });
