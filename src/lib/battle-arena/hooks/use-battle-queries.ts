import { useSuspenseQuery } from "@tanstack/react-query";
import { listBattles, getBattle, listMyBattleStats } from "@/lib/battle-arena.functions";

export function useBattles(scope: any = "all") {
  return useSuspenseQuery({
    queryKey: ["battles", scope],
    queryFn: () => listBattles({ data: { scope } }),
  });
}

export function useBattleDetails(id: string) {
  return useSuspenseQuery({
    queryKey: ["battle", id],
    queryFn: () => getBattle({ data: { id } }),
  });
}

export function useMyBattleStats() {
  return useSuspenseQuery({
    queryKey: ["battle-stats-me"],
    queryFn: () => listMyBattleStats(),
  });
}
