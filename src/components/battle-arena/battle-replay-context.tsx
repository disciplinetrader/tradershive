import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getReplayCandles } from "@/lib/replay.functions";
import { recordBattleReplayTrade } from "@/lib/battle-replay.functions";
import { battleTradeRowFrom } from "@/lib/replay/battle-pnl";
import {
  advanceBattleSession,
  battleProgress,
  createBattleSession,
  type BattleReplayConfig,
  type BattleSession,
} from "@/lib/replay/battle-session";
import type { Candle, Timeframe } from "@/lib/replay/types";
import type { ExecutionStores } from "@/components/trading/execution-stores";

/**
 * Owns the replay session for a battle screen.
 *
 * One session per participant, mounted at the route so the scrubber, the chart
 * and (step 4) the order path all read the same engine. The alternative —
 * each consumer building its own — would give one screen several engines at
 * different cursors, which is the class of bug this whole design exists to
 * prevent.
 *
 * The engine advances on a timer that runs REGARDLESS of what the UI is doing.
 * See `paused` below: a participant may stop looking at the market, never stop
 * it.
 */

/** How often the local engine is pulled up to the authoritative cursor. */
const ADVANCE_INTERVAL_MS = 250;

export interface BattleReplayView {
  status: "idle" | "loading" | "ready" | "error";
  session: BattleSession | null;
  stores: ExecutionStores | null;
  /** Bars the chart may draw. Frozen at the pause point while `paused`. */
  candles: Candle[];
  /** Authoritative observation index. Keeps moving while `paused`. */
  cursor: number;
  /** 0..1 across the battle's slice of the tape. */
  progress: number;
  /** True once the tape is fully consumed. */
  atEnd: boolean;
  /**
   * Whether this viewer has frozen their own chart. Never affects the market:
   * the engine keeps advancing, stops and targets keep resolving, and resuming
   * snaps the view to wherever the battle now is.
   */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  error: string | null;
}

const EMPTY: BattleReplayView = {
  status: "idle",
  session: null,
  stores: null,
  candles: [],
  cursor: 0,
  progress: 0,
  atEnd: false,
  paused: false,
  setPaused: () => {},
  error: null,
};

const BattleReplayContext = createContext<BattleReplayView>(EMPTY);

/** The replay half of a `battles` row, as the route reads it. */
export interface BattleReplayRow {
  id: string;
  replay_dataset_id: string | null;
  replay_symbol: string | null;
  replay_timeframe: string | null;
  replay_from: string | null;
  replay_to: string | null;
  replay_speed: number | null;
  replay_start_cursor: number | null;
  start_at: string;
  market?: string | null;
  starting_balance?: number | null;
}

/** A battle is a replay battle exactly when it carries a dataset. */
export function isReplayBattle(battle: Partial<BattleReplayRow> | null | undefined): boolean {
  return !!battle?.replay_dataset_id;
}

export function BattleReplayProvider({
  battle,
  userId,
  accountId,
  children,
}: {
  battle: BattleReplayRow | null | undefined;
  userId?: string;
  /** The participant's battle paper account — where recorded fills land. */
  accountId?: string;
  children: ReactNode;
}) {
  const fnCandles = useServerFn(getReplayCandles);
  const fnRecord = useServerFn(recordBattleReplayTrade);
  const enabled = isReplayBattle(battle);

  const config: BattleReplayConfig | null = useMemo(() => {
    if (!battle || !enabled) return null;
    return {
      battleId: battle.id,
      userId,
      datasetId: battle.replay_dataset_id!,
      symbol: battle.replay_symbol!,
      timeframe: battle.replay_timeframe as Timeframe,
      market: battle.market ?? null,
      startAt: battle.start_at,
      speed: Number(battle.replay_speed ?? 1),
      startCursor: Number(battle.replay_start_cursor ?? 0),
      startingBalance: battle.starting_balance ?? null,
    };
  }, [battle, enabled, userId]);

  const candleQuery = useQuery({
    queryKey: ["battle-replay-candles", config?.battleId, config?.datasetId],
    enabled: !!config,
    // The tape is immutable for the life of the battle — never refetch it.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: () =>
      fnCandles({
        data: {
          symbol: config!.symbol,
          timeframe: config!.timeframe as never,
          from: new Date(battle!.replay_from!).getTime(),
          to: new Date(battle!.replay_to!).getTime(),
          market: config!.market ?? undefined,
        },
      }),
  });

  const [session, setSession] = useState<BattleSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  // Bumped by the advance timer to re-render consumers.
  const [, setTick] = useState(0);

  // Build the session once per battle+dataset.
  useEffect(() => {
    if (!config || !candleQuery.data) return;
    const payload = candleQuery.data as unknown as {
      candles?: Candle[];
      providerId?: string | null;
      unavailable?: unknown;
    };
    if (payload.unavailable) {
      setSession(null);
      setError("Historical data for this battle is unavailable.");
      return;
    }
    const built = createBattleSession(config, (payload.candles ?? []) as Candle[], {
      provider: payload.providerId ?? "unknown",
    });
    if (!built.ok) {
      setSession(null);
      setError(built.message);
      return;
    }
    setError(null);
    setSession(built);
  }, [config, candleQuery.data]);

  // ── the advance loop ───────────────────────────────────────────────────
  //
  // setInterval, not requestAnimationFrame. rAF does not fire in a hidden tab,
  // which for a battle would mean a backgrounded participant's stops and targets
  // stop resolving while the market moves on without them. An interval is
  // throttled in background tabs but still fires, and because the engine is
  // driven to an absolute cursor rather than by elapsed deltas, a late tick
  // simply replays everything it missed.
  //
  // `paused` is deliberately not consulted here.
  const sessionRef = useRef<BattleSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    if (!session) return;
    const pump = () => {
      const current = sessionRef.current;
      if (!current) return;
      const { consumed } = advanceBattleSession(current);
      // Re-render on movement, and once on arrival so the first paint is right.
      if (consumed > 0) setTick((n) => n + 1);
    };
    pump();
    const timer = setInterval(pump, ADVANCE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [session]);

  // ── recording fills into paper_trades ──────────────────────────────────
  //
  // The engine closes trades locally; battles read `paper_trades`. This is the
  // only place the two meet. Engine-derived `pnl` and `realizedR` are written
  // through rather than recomputed — recomputing through the paper formula
  // would produce a second number that could disagree with the blotter the
  // trader watched it happen on. The risk that creates is contained by only
  // allowing symbols where the two formulas provably agree (see battle-pnl.ts).
  const recorded = useRef(new Set<string>());
  const recordRef = useRef(fnRecord);
  recordRef.current = fnRecord;

  useEffect(() => {
    if (!session || !accountId || !userId) return;
    const store = session.stores.trades;
    if (!store) return;

    const flush = () => {
      for (const trade of store.list()) {
        if (recorded.current.has(trade.id)) continue;
        // Claim before awaiting: the store can emit again mid-flight, and a
        // duplicate insert would double-count in the leaderboard.
        recorded.current.add(trade.id);

        const row = battleTradeRowFrom(trade, {
          userId,
          accountId,
          battleId: session.config.battleId,
          market: session.config.market ?? "crypto",
          observationCursor: session.engine.clock.index,
        });

        void recordRef
          .current({
            data: {
              battleId: row.battle_id,
              accountId: row.account_id,
              symbol: row.symbol,
              market: row.market,
              direction: row.direction,
              orderType: row.order_type,
              lotSize: row.lot_size,
              entryPrice: row.entry_price,
              exitPrice: row.exit_price,
              stopLoss: row.stop_loss,
              takeProfit: row.take_profit,
              riskAmount: row.risk_amount,
              pnl: row.pnl,
              rrRealized: row.rr_realized,
              commission: row.commission,
              closeReason: row.close_reason,
              openedAt: row.opened_at,
              closedAt: row.closed_at,
              observationCursor: row.observation_cursor ?? 0,
            },
          })
          .catch((e: unknown) => {
            // Un-claim so a transient failure retries on the next emission.
            // A rules rejection (battle not live, symbol not allowed) will
            // simply fail again, which is the correct outcome.
            recorded.current.delete(trade.id);
            console.error("[battle-replay] failed to record fill", e);
          });
      }
    };

    flush();
    return store.subscribe(flush);
  }, [session, accountId, userId]);

  // Candles the chart may draw. While paused the view is frozen at the bars
  // visible when the viewer stepped away — the engine behind it has moved on.
  const frozen = useRef<Candle[] | null>(null);
  const liveCandles = session ? (session.engine.clock.visibleCandles() as Candle[]) : [];
  if (!paused) frozen.current = null;
  else if (frozen.current === null) frozen.current = liveCandles;

  const value: BattleReplayView = {
    status: !enabled
      ? "idle"
      : error
        ? "error"
        : session
          ? "ready"
          : candleQuery.isError
            ? "error"
            : "loading",
    session,
    stores:
      session && session.stores.trades
        ? { orders: session.stores.orders, trades: session.stores.trades }
        : null,
    candles: paused && frozen.current ? frozen.current : liveCandles,
    cursor: session?.engine.clock.index ?? 0,
    progress: session ? battleProgress(session) : 0,
    atEnd: session?.engine.clock.atEnd ?? false,
    paused,
    setPaused,
    error: error ?? (candleQuery.isError ? "Could not load market data for this battle." : null),
  };

  return <BattleReplayContext.Provider value={value}>{children}</BattleReplayContext.Provider>;
}

export function useBattleReplay(): BattleReplayView {
  return useContext(BattleReplayContext);
}
