import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addChecklistItem,
  closeReplayTrade,
  createReplayBookmark,
  createReplayCheckpoint,
  createReplayNote,
  createReplayTrade,
  createScreenshotRecord,
  deleteReplayBookmark,
  deleteReplayCheckpoint,
  deleteReplayNote,
  deleteReplayTrade,
  finishReplaySession,
  getReplayCandles,
  getReplaySession,
  listReplayCheckpoints,
  resetReplayProgress,
  toggleChecklistItem,
  updateReplaySession,
} from "@/lib/replay.functions";
import { TIMEFRAME_SECONDS } from "@/lib/replay/constants";
import type {
  BookmarkCategory,
  Candle,
  CheckpointKind,
  FastForwardEvent,
  JumpTarget,
  OrderType,
  PendingOrder,
  ReplayBookmark,
  ReplayCheckpoint,
  ReplayChecklistItem,
  ReplayNote,
  ReplaySession,
  ReplayTrade,
  Timeframe,
} from "@/lib/replay/types";
import { uploadReplayScreenshot } from "@/lib/replay/storage";
import { useAuth } from "@/hooks/use-auth";
import * as nav from "@/lib/replay/navigation";

type ReplayCtx = {
  loading: boolean;
  session: ReplaySession | null;
  candles: Candle[];
  visibleCandles: Candle[];
  cursorIdx: number;
  cursorTs: number;
  stepSec: number;
  playing: boolean;
  speed: number;
  trades: ReplayTrade[];
  openTrades: ReplayTrade[];
  pendingOrders: PendingOrder[];
  notes: ReplayNote[];
  bookmarks: ReplayBookmark[];
  checklist: ReplayChecklistItem[];
  checkpoints: ReplayCheckpoint[];
  score: any;
  screenshots: any[];
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  step: (n: number) => void;
  skip: (n: number) => void;
  setSpeed: (s: number) => void;
  setCursorIdx: (i: number) => void;
  jumpTo: (target: JumpTarget) => void;
  fastForwardUntil: (event: FastForwardEvent) => void;
  openTrade: (opts: { direction: "long" | "short"; orderType: OrderType; lotSize: number; stopLoss?: number | null; takeProfit?: number | null; riskPct?: number | null; entryPrice?: number | null }) => Promise<void>;
  closeTrade: (id: string) => Promise<void>;
  cancelTrade: (id: string) => Promise<void>;
  cancelPendingOrder: (id: string) => void;
  addNote: (body: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addBookmark: (label: string, category: BookmarkCategory) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  toggleCheck: (id: string, checked: boolean) => Promise<void>;
  addCheck: (label: string) => Promise<void>;
  addCheckpoint: (kind: CheckpointKind, label?: string) => Promise<void>;
  jumpToCheckpoint: (id: string) => void;
  removeCheckpoint: (id: string) => Promise<void>;
  captureScreenshot: (dataUrl: string, caption?: string) => Promise<void>;
  finish: () => Promise<void>;
  replayAgain: () => Promise<void>;
};

const Ctx = createContext<ReplayCtx | null>(null);

export function useReplay() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReplay must be used within ReplayProvider");
  return v;
}

export function ReplayProvider({ id, children }: { id: string; children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const getSess = useServerFn(getReplaySession);
  const getCandles = useServerFn(getReplayCandles);
  const listCps = useServerFn(listReplayCheckpoints);

  const query = useQuery({
    queryKey: ["replay", id],
    queryFn: () => getSess({ data: { id } }),
  });

  const session = (query.data?.session ?? null) as ReplaySession | null;
  const stepSec = session ? TIMEFRAME_SECONDS[(session.timeframe as Timeframe) ?? "5m"] : 300;

  const candleQuery = useQuery({
    queryKey: ["replay-candles", id, session?.symbol, session?.timeframe, session?.replay_date, session?.range_start, session?.range_end],
    enabled: !!session,
    queryFn: async () => {
      // Long-session support: honour range_start/range_end when present, else 24h window.
      let from: number;
      let to: number;
      if (session!.range_start && session!.range_end) {
        from = new Date(session!.range_start).getTime();
        to = new Date(session!.range_end).getTime();
      } else {
        const dateStr = session!.replay_date ?? new Date().toISOString().slice(0, 10);
        const midnight = new Date(`${dateStr}T00:00:00Z`).getTime();
        from = midnight;
        to = midnight + 24 * 3600 * 1000;
      }
      const r = await getCandles({
        data: {
          symbol: session!.symbol,
          timeframe: session!.timeframe as Timeframe,
          from,
          to,
          provider: session!.provider,
        },
      });
      return r.candles as Candle[];
    },
  });

  const checkpointsQuery = useQuery({
    queryKey: ["replay-checkpoints", id],
    enabled: !!session,
    queryFn: () => listCps({ data: { session_id: id } }),
  });

  const candles = candleQuery.data ?? [];
  const checkpoints = (checkpointsQuery.data ?? []) as ReplayCheckpoint[];

  const [cursorIdx, setCursorIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const prevCursorRef = useRef(0);

  // Initialize cursor when candles or session change
  useEffect(() => {
    if (!candles.length || !session) return;
    const target = session.cursor_ts ? new Date(session.cursor_ts).getTime() : candles[0].time;
    const nearest = Math.max(0, candles.findIndex((c) => c.time >= target));
    const idx = nearest === -1 ? Math.floor(candles.length / 3) : Math.max(20, nearest);
    setCursorIdx(idx);
    prevCursorRef.current = idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length, session?.id]);

  // High-speed batched playback loop
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  useEffect(() => {
    if (!playing) return;
    lastTickRef.current = performance.now();
    // Batched advance: base 2 candles/s at 1x. For speeds >16 we advance N candles per tick to stay 60fps.
    const candlesPerSec = speed * 2;
    // Cap tick rate to 60fps
    const intervalMs = Math.max(16, 1000 / Math.min(60, candlesPerSec));
    const advancePerTick = Math.max(1, Math.round(candlesPerSec / (1000 / intervalMs)));

    const tick = (now: number) => {
      const dt = now - lastTickRef.current;
      if (dt >= intervalMs) {
        lastTickRef.current = now;
        setCursorIdx((i) => {
          const next = Math.min(candles.length - 1, i + advancePerTick);
          if (next >= candles.length - 1) setPlaying(false);
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, candles.length]);

  // Persist cursor every 5s (debounced)
  const updateSess = useServerFn(updateReplaySession);
  useEffect(() => {
    if (!session || !candles.length) return;
    const timer = setTimeout(() => {
      const ts = candles[cursorIdx]?.time;
      if (!ts) return;
      const startTs = candles[0]?.time ?? ts;
      const endTs = candles[candles.length - 1]?.time ?? ts;
      const pct = Math.round(((ts - startTs) / Math.max(1, endTs - startTs)) * 100);
      updateSess({
        data: {
          id: session.id,
          cursor_ts: new Date(ts).toISOString(),
          completion_pct: pct,
          duration_seconds: (session.duration_seconds ?? 0) + 5,
          playback_speed: speed,
        },
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx, speed]);

  // Auto-save on unload (flush latest cursor)
  useEffect(() => {
    if (!session || !candles.length) return;
    const flush = () => {
      const ts = candles[cursorIdx]?.time;
      if (!ts) return;
      // Fire-and-forget with keepalive so it survives unload
      updateSess({
        data: { id: session.id, cursor_ts: new Date(ts).toISOString(), playback_speed: speed },
      }).catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx, speed, session?.id]);

  const visibleCandles = useMemo(() => candles.slice(0, cursorIdx + 1), [candles, cursorIdx]);
  const cursorTs = candles[cursorIdx]?.time ?? Date.now();
  const currentPrice = candles[cursorIdx]?.close ?? 0;

  const trades: ReplayTrade[] = (query.data?.trades ?? []) as any;
  const openTrades = useMemo(() => trades.filter((t) => t.status === "open"), [trades]);

  const closeFn = useServerFn(closeReplayTrade);
  const openFn = useServerFn(createReplayTrade);

  // Advance-window trigger scan: walks skipped candles for SL/TP hits + pending-order fills.
  useEffect(() => {
    if (!candles.length) return;
    const from = prevCursorRef.current + 1;
    const to = cursorIdx;
    prevCursorRef.current = cursorIdx;
    if (from > to) return;

    for (let i = from; i <= to; i++) {
      const c = candles[i];
      // SL/TP on open trades
      for (const t of openTrades) {
        let hitPrice: number | null = null;
        if (t.direction === "long") {
          if (t.stop_loss != null && c.low <= t.stop_loss) hitPrice = t.stop_loss;
          else if (t.take_profit != null && c.high >= t.take_profit) hitPrice = t.take_profit;
        } else {
          if (t.stop_loss != null && c.high >= t.stop_loss) hitPrice = t.stop_loss;
          else if (t.take_profit != null && c.low <= t.take_profit) hitPrice = t.take_profit;
        }
        if (hitPrice != null) {
          const pnl = (t.direction === "long" ? hitPrice - t.entry_price : t.entry_price - hitPrice) * t.lot_size;
          const risk = t.stop_loss ? Math.abs(t.entry_price - t.stop_loss) * t.lot_size : 0;
          const rrRealized = risk > 0 ? pnl / risk : null;
          closeFn({
            data: { id: t.id, exit_price: hitPrice, closed_at: new Date(c.time).toISOString(), pnl, rr_realized: rrRealized },
          })
            .then(() => qc.invalidateQueries({ queryKey: ["replay", id] }))
            .catch(() => {});
        }
      }
      // Pending order triggers
      if (pendingOrders.length && session) {
        const stillPending: PendingOrder[] = [];
        for (const p of pendingOrders) {
          let triggered = false;
          if (p.direction === "long" && p.orderType === "limit" && c.low <= p.entryPrice) triggered = true;
          else if (p.direction === "long" && p.orderType === "stop" && c.high >= p.entryPrice) triggered = true;
          else if (p.direction === "short" && p.orderType === "limit" && c.high >= p.entryPrice) triggered = true;
          else if (p.direction === "short" && p.orderType === "stop" && c.low <= p.entryPrice) triggered = true;

          if (triggered) {
            openFn({
              data: {
                session_id: session.id,
                symbol: session.symbol,
                market: session.market,
                direction: p.direction,
                order_type: "market",
                entry_price: p.entryPrice,
                stop_loss: p.stopLoss,
                take_profit: p.takeProfit,
                lot_size: p.lotSize,
                risk_pct: p.riskPct,
                rr_planned: p.stopLoss && p.takeProfit ? Math.abs(p.takeProfit - p.entryPrice) / Math.abs(p.entryPrice - p.stopLoss) : null,
                opened_at: new Date(c.time).toISOString(),
              },
            })
              .then(() => qc.invalidateQueries({ queryKey: ["replay", id] }))
              .catch(() => {});
            toast.success(`Pending ${p.direction} ${p.orderType} filled @ ${p.entryPrice.toFixed(5)}`);
          } else {
            stillPending.push(p);
          }
        }
        if (stillPending.length !== pendingOrders.length) setPendingOrders(stillPending);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx]);

  const openMut = useMutation({ mutationFn: openFn, onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const closeMut = useMutation({ mutationFn: closeFn, onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const delTradeMut = useMutation({ mutationFn: useServerFn(deleteReplayTrade), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const noteMut = useMutation({ mutationFn: useServerFn(createReplayNote), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const delNoteMut = useMutation({ mutationFn: useServerFn(deleteReplayNote), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const bmMut = useMutation({ mutationFn: useServerFn(createReplayBookmark), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const delBmMut = useMutation({ mutationFn: useServerFn(deleteReplayBookmark), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const chkMut = useMutation({ mutationFn: useServerFn(toggleChecklistItem), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const addChkMut = useMutation({ mutationFn: useServerFn(addChecklistItem), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const ssMut = useMutation({ mutationFn: useServerFn(createScreenshotRecord), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const finishMut = useMutation({ mutationFn: useServerFn(finishReplaySession), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }) });
  const cpAddMut = useMutation({ mutationFn: useServerFn(createReplayCheckpoint), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay-checkpoints", id] }) });
  const cpDelMut = useMutation({ mutationFn: useServerFn(deleteReplayCheckpoint), onSuccess: () => qc.invalidateQueries({ queryKey: ["replay-checkpoints", id] }) });
  const resetMut = useMutation({ mutationFn: useServerFn(resetReplayProgress) });

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const restart = useCallback(() => {
    prevCursorRef.current = 20;
    setCursorIdx(20);
    setPlaying(false);
  }, []);
  const step = useCallback((n: number) => setCursorIdx((i) => Math.max(0, Math.min(candles.length - 1, i + n))), [candles.length]);
  const skip = useCallback((n: number) => setCursorIdx((i) => Math.max(0, Math.min(candles.length - 1, i + n))), [candles.length]);

  // ---- Jump navigation ----
  const bookmarks = (query.data?.bookmarks ?? []) as ReplayBookmark[];
  const checklist = (query.data?.checklist ?? []) as ReplayChecklistItem[];

  const jumpTo = useCallback(
    (target: JumpTarget) => {
      if (!candles.length) return;
      let idx: number | null = null;
      switch (target) {
        case "next_session": idx = nav.nextSession(candles, cursorIdx); break;
        case "prev_session": idx = nav.prevSession(candles, cursorIdx); break;
        case "london_open": idx = nav.jumpToSessionOpen(candles, cursorIdx, "london"); break;
        case "ny_open": idx = nav.jumpToSessionOpen(candles, cursorIdx, "new_york"); break;
        case "asia_open": idx = nav.jumpToSessionOpen(candles, cursorIdx, "asia"); break;
        case "session_close": idx = nav.jumpToSessionClose(candles, cursorIdx); break;
        case "next_bookmark": idx = nav.nextBookmark(candles, cursorIdx, bookmarks); break;
        case "prev_bookmark": idx = nav.prevBookmark(candles, cursorIdx, bookmarks); break;
        case "next_trade": idx = nav.nextTrade(candles, cursorIdx, trades); break;
        case "prev_trade": idx = nav.prevTrade(candles, cursorIdx, trades); break;
        case "trade_entry": idx = nav.tradeEntry(candles, trades); break;
        case "trade_exit": idx = nav.tradeExit(candles, trades); break;
        case "next_objective": idx = nav.nextObjective(candles, cursorIdx, checklist); break;
        case "prev_objective": idx = nav.prevObjective(candles, cursorIdx, checklist); break;
        case "next_day": idx = nav.nextDay(candles, cursorIdx); break;
        case "prev_day": idx = nav.prevDay(candles, cursorIdx); break;
        case "next_checkpoint": idx = nav.nextCheckpoint(candles, cursorIdx, checkpoints); break;
        case "prev_checkpoint": idx = nav.prevCheckpoint(candles, cursorIdx, checkpoints); break;
      }
      if (idx == null) { toast.info("No matching target ahead."); return; }
      prevCursorRef.current = idx;
      setCursorIdx(Math.max(0, Math.min(candles.length - 1, idx)));
    },
    [candles, cursorIdx, bookmarks, trades, checklist, checkpoints],
  );

  // ---- Fast-forward until event ----
  const fastForwardUntil = useCallback(
    (event: FastForwardEvent) => {
      if (!candles.length) return;
      const start = cursorIdx + 1;
      let hitIdx: number | null = null;
      outer: for (let i = start; i < candles.length; i++) {
        const c = candles[i];
        switch (event) {
          case "next_sl":
          case "next_tp":
          case "next_order_trigger": {
            for (const t of openTrades) {
              const isSL = event === "next_sl";
              const isTP = event === "next_tp";
              if ((isSL || event === "next_order_trigger") && t.stop_loss != null) {
                if (t.direction === "long" && c.low <= t.stop_loss) { hitIdx = i; break outer; }
                if (t.direction === "short" && c.high >= t.stop_loss) { hitIdx = i; break outer; }
              }
              if ((isTP || event === "next_order_trigger") && t.take_profit != null) {
                if (t.direction === "long" && c.high >= t.take_profit) { hitIdx = i; break outer; }
                if (t.direction === "short" && c.low <= t.take_profit) { hitIdx = i; break outer; }
              }
            }
            if (event === "next_order_trigger") {
              for (const p of pendingOrders) {
                if (p.direction === "long" && p.orderType === "limit" && c.low <= p.entryPrice) { hitIdx = i; break outer; }
                if (p.direction === "long" && p.orderType === "stop" && c.high >= p.entryPrice) { hitIdx = i; break outer; }
                if (p.direction === "short" && p.orderType === "limit" && c.high >= p.entryPrice) { hitIdx = i; break outer; }
                if (p.direction === "short" && p.orderType === "stop" && c.low <= p.entryPrice) { hitIdx = i; break outer; }
              }
            }
            break;
          }
          case "next_pending_order": {
            for (const p of pendingOrders) {
              if (p.direction === "long" && p.orderType === "limit" && c.low <= p.entryPrice) { hitIdx = i; break outer; }
              if (p.direction === "long" && p.orderType === "stop" && c.high >= p.entryPrice) { hitIdx = i; break outer; }
              if (p.direction === "short" && p.orderType === "limit" && c.high >= p.entryPrice) { hitIdx = i; break outer; }
              if (p.direction === "short" && p.orderType === "stop" && c.low <= p.entryPrice) { hitIdx = i; break outer; }
            }
            break;
          }
          case "next_bookmark": {
            const bm = bookmarks.find((b) => new Date(b.bookmark_ts).getTime() === c.time || (new Date(b.bookmark_ts).getTime() > candles[i - 1]?.time && new Date(b.bookmark_ts).getTime() <= c.time));
            if (bm) { hitIdx = i; break outer; }
            break;
          }
          case "next_session": {
            const prev = candles[i - 1];
            if (prev && new Date(prev.time).getUTCHours() !== new Date(c.time).getUTCHours()) {
              const h = new Date(c.time).getUTCHours();
              if (h === 0 || h === 7 || h === 12) { hitIdx = i; break outer; }
            }
            break;
          }
          case "next_day": {
            const prev = candles[i - 1];
            if (prev && new Date(prev.time).toISOString().slice(0, 10) !== new Date(c.time).toISOString().slice(0, 10)) { hitIdx = i; break outer; }
            break;
          }
        }
      }
      setPlaying(false);
      if (hitIdx == null) { toast.info("No matching event ahead."); return; }
      prevCursorRef.current = cursorIdx; // keep skip walker consistent
      setCursorIdx(hitIdx);
      toast.success(`Stopped at ${event.replace(/_/g, " ")}`);
    },
    [candles, cursorIdx, openTrades, pendingOrders, bookmarks],
  );

  // ---- Trade actions ----
  const openTrade: ReplayCtx["openTrade"] = useCallback(
    async (opts) => {
      if (!session) return;
      // Pending order (limit/stop) — hold client-side until price triggers.
      if ((opts.orderType === "limit" || opts.orderType === "stop") && opts.entryPrice != null) {
        setPendingOrders((prev) => [
          ...prev,
          {
            id: `p_${Date.now()}`,
            direction: opts.direction,
            orderType: opts.orderType as "limit" | "stop",
            entryPrice: opts.entryPrice!,
            stopLoss: opts.stopLoss ?? null,
            takeProfit: opts.takeProfit ?? null,
            lotSize: opts.lotSize,
            riskPct: opts.riskPct ?? null,
            createdAtTs: cursorTs,
          },
        ]);
          ...prev,
          {
            id: `p_${Date.now()}`,
            direction: opts.direction,
            orderType: opts.orderType,
            entryPrice: opts.entryPrice!,
            stopLoss: opts.stopLoss ?? null,
            takeProfit: opts.takeProfit ?? null,
            lotSize: opts.lotSize,
            riskPct: opts.riskPct ?? null,
            createdAtTs: cursorTs,
          },
        ]);
        toast.success(`Placed ${opts.direction} ${opts.orderType} @ ${opts.entryPrice.toFixed(5)}`);
        return;
      }
      // Market order — hit immediately
      const entry = currentPrice;
      const risk = opts.stopLoss ? Math.abs(entry - opts.stopLoss) : null;
      const rrPlanned = risk && opts.takeProfit ? Math.abs(opts.takeProfit - entry) / risk : null;
      await openMut.mutateAsync({
        data: {
          session_id: session.id,
          symbol: session.symbol,
          market: session.market,
          direction: opts.direction,
          order_type: "market",
          entry_price: entry,
          stop_loss: opts.stopLoss ?? null,
          take_profit: opts.takeProfit ?? null,
          lot_size: opts.lotSize,
          risk_pct: opts.riskPct ?? null,
          rr_planned: rrPlanned,
          opened_at: new Date(cursorTs).toISOString(),
        },
      });
      toast.success(`${opts.direction === "long" ? "Long" : "Short"} @ ${entry.toFixed(5)}`);
    },
    [session, currentPrice, cursorTs, openMut],
  );

  const closeTrade = useCallback(
    async (tid: string) => {
      const t = trades.find((x) => x.id === tid);
      if (!t || !session) return;
      const exit = currentPrice;
      const pnl = (t.direction === "long" ? exit - t.entry_price : t.entry_price - exit) * t.lot_size;
      const risk = t.stop_loss ? Math.abs(t.entry_price - t.stop_loss) * t.lot_size : 0;
      const rr = risk > 0 ? pnl / risk : null;
      await closeMut.mutateAsync({
        data: { id: tid, exit_price: exit, closed_at: new Date(cursorTs).toISOString(), pnl, rr_realized: rr },
      });
      toast.success(`Closed @ ${exit.toFixed(5)} — PnL ${pnl.toFixed(2)}`);
    },
    [trades, session, currentPrice, cursorTs, closeMut],
  );

  const cancelTrade = useCallback(async (tid: string) => { await delTradeMut.mutateAsync({ data: { id: tid } }); }, [delTradeMut]);
  const cancelPendingOrder = useCallback((pid: string) => setPendingOrders((prev) => prev.filter((p) => p.id !== pid)), []);

  const addNote = useCallback(
    async (body: string) => {
      if (!session || !body.trim()) return;
      await noteMut.mutateAsync({ data: { session_id: session.id, note_ts: new Date(cursorTs).toISOString(), body } });
    },
    [session, cursorTs, noteMut],
  );
  const removeNote = useCallback(async (nid: string) => { await delNoteMut.mutateAsync({ data: { id: nid } }); }, [delNoteMut]);

  const addBookmark = useCallback(
    async (label: string, category: BookmarkCategory) => {
      if (!session) return;
      await bmMut.mutateAsync({ data: { session_id: session.id, bookmark_ts: new Date(cursorTs).toISOString(), label, category } });
    },
    [session, cursorTs, bmMut],
  );
  const removeBookmark = useCallback(async (bid: string) => { await delBmMut.mutateAsync({ data: { id: bid } }); }, [delBmMut]);

  const toggleCheck = useCallback(async (cid: string, checked: boolean) => { await chkMut.mutateAsync({ data: { id: cid, checked } }); }, [chkMut]);
  const addCheck = useCallback(
    async (label: string) => {
      if (!session || !label.trim()) return;
      await addChkMut.mutateAsync({ data: { session_id: session.id, label } });
    },
    [session, addChkMut],
  );

  const addCheckpoint = useCallback(
    async (kind: CheckpointKind, label?: string) => {
      if (!session) return;
      await cpAddMut.mutateAsync({
        data: {
          session_id: session.id,
          kind,
          label: label ?? kind.replace(/_/g, " "),
          checkpoint_ts: new Date(cursorTs).toISOString(),
        },
      });
      toast.success("Checkpoint saved");
    },
    [session, cursorTs, cpAddMut],
  );
  const jumpToCheckpoint = useCallback(
    (cpid: string) => {
      const cp = checkpoints.find((c) => c.id === cpid);
      if (!cp || !candles.length) return;
      const target = new Date(cp.checkpoint_ts).getTime();
      const idx = Math.max(0, candles.findIndex((c) => c.time >= target));
      if (idx === -1) return;
      prevCursorRef.current = idx;
      setCursorIdx(idx);
    },
    [checkpoints, candles],
  );
  const removeCheckpoint = useCallback(async (cid: string) => { await cpDelMut.mutateAsync({ data: { id: cid } }); }, [cpDelMut]);

  const captureScreenshot = useCallback(
    async (dataUrl: string, caption?: string) => {
      if (!session || !user) return;
      try {
        const { path } = await uploadReplayScreenshot(user.id, session.id, dataUrl);
        await ssMut.mutateAsync({
          data: { session_id: session.id, storage_path: path, captured_ts: new Date(cursorTs).toISOString(), caption: caption ?? null },
        });
        toast.success("Screenshot saved");
      } catch (e) {
        toast.error(`Failed to save screenshot: ${(e as Error).message}`);
      }
    },
    [session, user, cursorTs, ssMut],
  );

  const finish = useCallback(async () => {
    if (!session) return;
    const r = await finishMut.mutateAsync({ data: { id: session.id } });
    toast.success(`Replay complete — Score ${r.score.score}/100`);
  }, [session, finishMut]);

  const replayAgain = useCallback(async () => {
    if (!session) return;
    setPlaying(false);
    setPendingOrders([]);
    prevCursorRef.current = 20;
    setCursorIdx(20);
    await resetMut.mutateAsync({ data: { session_id: session.id } });
    await qc.invalidateQueries({ queryKey: ["replay", id] });
    toast.success("Replay reset — same scenario, fresh start");
  }, [session, resetMut, qc, id]);

  const value: ReplayCtx = {
    loading: query.isPending || candleQuery.isPending,
    session,
    candles,
    visibleCandles,
    cursorIdx,
    cursorTs,
    stepSec,
    playing,
    speed,
    trades,
    openTrades,
    pendingOrders,
    notes: (query.data?.notes ?? []) as any,
    bookmarks,
    checklist,
    checkpoints,
    score: query.data?.score ?? null,
    screenshots: query.data?.screenshots ?? [],
    play, pause, toggle, restart, step, skip, setSpeed, setCursorIdx,
    jumpTo, fastForwardUntil,
    openTrade, closeTrade, cancelTrade, cancelPendingOrder,
    addNote, removeNote, addBookmark, removeBookmark,
    toggleCheck, addCheck,
    addCheckpoint, jumpToCheckpoint, removeCheckpoint,
    captureScreenshot, finish, replayAgain,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
