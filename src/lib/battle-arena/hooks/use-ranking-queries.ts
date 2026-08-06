import { useSuspenseQuery } from "@tanstack/react-query";
import { getRankingSession, getLeaderboard } from "@/lib/battle-arena/ranking.functions";

export function useRankingSession() {
  return useSuspenseQuery({
    queryKey: ["ranking-session"],
    queryFn: () => getRankingSession(),
  });
}

export function useLeaderboard(limit: number = 10) {
  return useSuspenseQuery({
    queryKey: ["leaderboard", limit],
    queryFn: () => getLeaderboard({ data: { limit } }),
  });
}
