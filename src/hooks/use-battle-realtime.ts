import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { subscribeAndTrack } from "@/lib/observability/realtime-health";

/**
 * The single realtime subscription for a battle.
 *
 * Everything on a battle screen — the route, the command rail, the chat, the
 * trade counters — invalidates off one channel registered here. This used to be
 * three channels across two components (`battle-detail-*`, `battle-trades-*`,
 * and `arena-rail-*`, the last of which was mounted twice), which meant
 * `supabase-js` held two channel objects on the same topic: it does not dedupe
 * by topic, so `removeChannel` on either unmount tore down a topic the other
 * still believed it was subscribed to, and every change fired its invalidation
 * twice.
 *
 * Owning the subscription here is also what makes `ArenaCommandRail`
 * presentational, and therefore safe to mount more than once.
 *
 * `onPaperTrades` fires for trades in this battle. It is held in a ref, so an
 * inline closure is fine — the callback's identity never resubscribes.
 */
export function useBattleRealtime(
  battleId: string | null | undefined,
  options?: { onPaperTrades?: () => void },
) {
  const qc = useQueryClient();
  const onPaperTrades = useRef(options?.onPaperTrades);
  onPaperTrades.current = options?.onPaperTrades;

  useEffect(() => {
    if (!battleId) return;

    const forBattle = `battle_id=eq.${battleId}`;
    const invalidate = (...keys: unknown[][]) => {
      for (const queryKey of keys) qc.invalidateQueries({ queryKey });
    };

    // All `.on()` registrations must be chained before the single
    // `.subscribe()` — bindings added after a channel joins are not sent to the
    // server.
    const ch = supabase
      .channel(`battle:${battleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battles", filter: `id=eq.${battleId}` },
        () => invalidate(["battle", battleId], ["battle-live-stats", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_participants", filter: forBattle },
        () => invalidate(["battle", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_rankings", filter: forBattle },
        () => invalidate(["battle", battleId], ["battle-live-stats", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_statistics_live", filter: forBattle },
        () => invalidate(["battle-live-stats", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "battle_events", filter: forBattle },
        () => invalidate(["battle-events", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_presence", filter: forBattle },
        () => invalidate(["battle-presence", battleId]),
      )
      // `BattleChat` deliberately owns no channel of its own; it renders in both
      // the lobby and the rail, and relies on this invalidation.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_chat", filter: forBattle },
        () => invalidate(["battle-chat", battleId]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paper_trades", filter: forBattle },
        () => onPaperTrades.current?.(),
      );

    subscribeAndTrack(ch);

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [battleId, qc]);
}
