import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBattles, getBattle, listMyBattleStats } from "@/lib/battle-arena.functions";

export function useBattles(scope: any = "all") {
  const fn = useServerFn(listBattles);
  return useQuery({
    queryKey: ["battles", scope],
    queryFn: () => fn({ data: { scope } }),
  });
}

export function useBattleDetails(id: string) {
  const fn = useServerFn(getBattle);
  return useQuery({
    queryKey: ["battle", id],
    queryFn: () => fn({ data: { id } }),
    enabled: !!id,
  });
}

export function useMyBattleStats() {
  const fn = useServerFn(listMyBattleStats);
  return useQuery({
    queryKey: ["battle-stats-me"],
    queryFn: () => fn(),
  });
}
