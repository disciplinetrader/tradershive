/**
 * Adaptive Dashboard Hero — server aggregator.
 *
 * Computes the minimal facts required to decide which of the five hero
 * states to render. All values are derived from real platform data
 * (replay_sessions, journal_entries, paper_trades, prop_challenges).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HeroReplay = {
  id: string;
  symbol: string | null;
  status: string | null;
  timeframe: string | null;
  durationSeconds: number;
  completionPct: number;
  updatedAt: string;
  hasJournal: boolean;
};

export type HeroChallenge = {
  id: string;
  name: string | null;
  status: string | null;
  paperAccountId: string | null;
  profitPct: number | null;
  targetPct: number | null;
  daysElapsed: number | null;
  daysTotal: number | null;
};

export type HeroState = {
  replayCount: number;
  journalCount: number;
  paperTradeCount: number;
  tradesToday: number;
  lastTradeAt: string | null;
  lastReplay: HeroReplay | null;
  activeChallenges: HeroChallenge[];
  generatedAt: string;
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const getHeroState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HeroState> => {
    const uid = context.userId;
    const now = new Date();
    const today0 = startOfDay(now).toISOString();

    const [replayCountRes, journalCountRes, tradeCountRes, todayTradesRes, lastTradeRes, lastReplayRes, journalIdsRes, challengesRes] =
      await Promise.all([
        context.supabase.from("replay_sessions").select("id", { count: "exact", head: true }).eq("user_id", uid),
        context.supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        context.supabase.from("paper_trades").select("id", { count: "exact", head: true }).eq("user_id", uid).is("deleted_at", null),
        context.supabase
          .from("paper_trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .is("deleted_at", null)
          .gte("opened_at", today0),
        context.supabase
          .from("paper_trades")
          .select("opened_at, closed_at")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .order("opened_at", { ascending: false })
          .limit(1),
        context.supabase
          .from("replay_sessions")
          .select("id, symbol, status, duration_seconds, updated_at, created_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1),
        context.supabase.from("journal_entries").select("trade_id").eq("user_id", uid).not("trade_id", "is", null).limit(2000),
        context.supabase
          .from("prop_challenges")
          .select("id, name, status, paper_account_id, starting_equity, current_equity, profit_target_pct, trading_days_used, duration_days, created_at")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const lastReplayRow = lastReplayRes.data?.[0] ?? null;
    const journalTradeIds = new Set<string>(
      (journalIdsRes.data ?? []).map((r: { trade_id: string | null }) => r.trade_id).filter((v): v is string => Boolean(v)),
    );

    // Determine if last replay has a journal entry — best-effort: replays and
    // journal entries aren't strictly linked by id, so we fall back to false
    // when there are no journal entries at all.
    const lastReplay: HeroReplay | null = lastReplayRow
      ? {
          id: lastReplayRow.id,
          symbol: lastReplayRow.symbol ?? null,
          status: lastReplayRow.status ?? null,
          durationSeconds: Number(lastReplayRow.duration_seconds ?? 0),
          updatedAt: lastReplayRow.updated_at ?? lastReplayRow.created_at,
          hasJournal: (journalCountRes.count ?? 0) > 0 && journalTradeIds.size > 0,
        }
      : null;

    const activeChallenges: HeroChallenge[] = (challengesRes.data ?? []).map((c: any) => {
      const start = Number(c.starting_equity ?? 0);
      const current = Number(c.current_equity ?? 0);
      const profitPct = start > 0 ? ((current - start) / start) * 100 : null;
      return {
        id: c.id,
        name: c.name ?? null,
        status: c.status ?? null,
        paperAccountId: c.paper_account_id ?? null,
        profitPct,
        targetPct: c.profit_target_pct != null ? Number(c.profit_target_pct) : null,
        daysElapsed: c.trading_days_used != null ? Number(c.trading_days_used) : null,
        daysTotal: c.duration_days != null ? Number(c.duration_days) : null,
      };
    });

    const lastTrade = lastTradeRes.data?.[0] ?? null;
    const lastTradeAt = lastTrade ? lastTrade.closed_at ?? lastTrade.opened_at ?? null : null;

    return {
      replayCount: replayCountRes.count ?? 0,
      journalCount: journalCountRes.count ?? 0,
      paperTradeCount: tradeCountRes.count ?? 0,
      tradesToday: todayTradesRes.count ?? 0,
      lastTradeAt,
      lastReplay,
      activeChallenges,
      generatedAt: now.toISOString(),
    };
  });
