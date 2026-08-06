import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRankingSession, getLeaderboard } from "@/lib/battle-arena/ranking.functions";

export function useRankingSession() {
  const fn = useServerFn(getRankingSession);
  return useQuery({
    queryKey: ["ranking-session"],
    queryFn: () => fn(),
  });
}

export function useLeaderboard(limit: number = 10) {
  const fn = useServerFn(getLeaderboard);
  return useQuery({
    queryKey: ["leaderboard", limit],
    queryFn: () => fn({ data: { limit } }),
  });
}
