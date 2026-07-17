import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addChecklistItem,
  closeReplayTrade,
  createReplayBookmark,
  createReplayNote,
  createReplayTrade,
  createScreenshotRecord,
  deleteReplayBookmark,
  deleteReplayNote,
  deleteReplayTrade,
  finishReplaySession,
  getReplayCandles,
  getReplaySession,
  toggleChecklistItem,
  updateReplaySession,
} from "@/lib/replay.functions";
import { TIMEFRAME_SECONDS } from "@/lib/replay/constants";
import type {
  BookmarkCategory,
  Candle,
  OrderType,
  ReplayBookmark,
  ReplayChecklistItem,
  ReplayNote,
  ReplaySession,
  ReplayTrade,
  Timeframe,
} from "@/lib/replay/types";
import { uploadReplayScreenshot } from "@/lib/replay/storage";
import { useAuth } from "@/hooks/use-auth";

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
  notes: ReplayNote[];
  bookmarks: ReplayBookmark[];
  checklist: ReplayChecklistItem[];
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
  openTrade: (opts: { direction: "long" | "short"; orderType: OrderType; lotSize: number; stopLoss?: number | null; takeProfit?: number | null; riskPct?: number | null }) => Promise<void>;
  closeTrade: (id: string) => Promise<void>;
  cancelTrade: (id: string) => Promise<void>;
  addNote: (body: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addBookmark: (label: string, category: BookmarkCategory) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  toggleCheck: (id: string, checked: boolean) => Promise<void>;
  addCheck: (label: string) => Promise<void>;
  captureScreenshot: (dataUrl: string, caption?: string) => Promise<void>;
  finish: () => Promise<void>;
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

  const query = useQuery({
    queryKey: ["replay", id],
    queryFn: () => getSess({ data: { id } }),
  });

  const session = query.data?.session ?? null;
  const stepSec = session ? TIMEFRAME_SECONDS[(session.timeframe as Timeframe) ?? "5m"] : 300;

  // Load candles: a broad window around the session date
  const candleQuery = useQuery({
    queryKey: ["replay-candles", id, session?.symbol, session?.timeframe, session?.replay_date],
    enabled: !!session,
    queryFn: async () => {
      const dateStr = session!.replay_date ?? new Date().toISOString().slice(0, 10);
      const midnight = new Date(`${dateStr}T00:00:00Z`).getTime();
      const from = midnight;
      const to = midnight + 24 * 3600 * 1000;
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

  const candles = candleQuery.data ?? [];

  const [cursorIdx, setCursorIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Initialize cursor when candles or session change
  useEffect(() => {
    if (!candles.length || !session) return;
    const target = session.cursor_ts ? new Date(session.cursor_ts).getTime() : candles[0].time;
    const nearest = Math.max(
      0,
      candles.findIndex((c) => c.time >= target),
    );
    setCursorIdx(nearest === -1 ? Math.floor(candles.length / 3) : Math.max(20, nearest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length, session?.id]);

  // Playback loop
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  useEffect(() => {
    if (!playing) return;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTickRef.current;
      const intervalMs = Math.max(30, 1000 / (speed * 2)); // 2 candles/s at 1x
      if (dt >= intervalMs) {
        lastTickRef.current = now;
        setCursorIdx((i) => {
          if (i >= candles.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, candles.length]);

  // Persist cursor occasionally
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

  const visibleCandles = useMemo(() => candles.slice(0, cursorIdx + 1), [candles, cursorIdx]);
  const cursorTs = candles[cursorIdx]?.time ?? Date.now();
  const currentPrice = candles[cursorIdx]?.close ?? 0;

  const trades: ReplayTrade[] = (query.data?.trades ?? []) as any;
  const openTrades = useMemo(() => trades.filter((t) => t.status === "open"), [trades]);

  // Auto-close on SL/TP as cursor advances
  const closeFn = useServerFn(closeReplayTrade);
  useEffect(() => {
    if (!candles.length || !openTrades.length) return;
    const c = candles[cursorIdx];
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
          data: {
            id: t.id,
            exit_price: hitPrice,
            closed_at: new Date(c.time).toISOString(),
            pnl,
            rr_realized: rrRealized,
          },
        })
          .then(() => qc.invalidateQueries({ queryKey: ["replay", id] }))
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx]);

  const openMut = useMutation({
    mutationFn: useServerFn(createReplayTrade),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const closeMut = useMutation({
    mutationFn: closeFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const delTradeMut = useMutation({
    mutationFn: useServerFn(deleteReplayTrade),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const noteMut = useMutation({
    mutationFn: useServerFn(createReplayNote),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const delNoteMut = useMutation({
    mutationFn: useServerFn(deleteReplayNote),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const bmMut = useMutation({
    mutationFn: useServerFn(createReplayBookmark),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const delBmMut = useMutation({
    mutationFn: useServerFn(deleteReplayBookmark),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const chkMut = useMutation({
    mutationFn: useServerFn(toggleChecklistItem),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const addChkMut = useMutation({
    mutationFn: useServerFn(addChecklistItem),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const ssMut = useMutation({
    mutationFn: useServerFn(createScreenshotRecord),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });
  const finishMut = useMutation({
    mutationFn: useServerFn(finishReplaySession),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", id] }),
  });

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const restart = useCallback(() => setCursorIdx(20), []);
  const step = useCallback((n: number) => setCursorIdx((i) => Math.max(0, Math.min(candles.length - 1, i + n))), [candles.length]);
  const skip = useCallback((n: number) => setCursorIdx((i) => Math.max(0, Math.min(candles.length - 1, i + n))), [candles.length]);

  const openTrade: ReplayCtx["openTrade"] = useCallback(
    async (opts) => {
      if (!session) return;
      const entry = currentPrice;
      const risk = opts.stopLoss ? Math.abs(entry - opts.stopLoss) : null;
      const rrPlanned = risk && opts.takeProfit ? Math.abs(opts.takeProfit - entry) / risk : null;
      await openMut.mutateAsync({
        data: {
          session_id: session.id,
          symbol: session.symbol,
          market: session.market,
          direction: opts.direction,
          order_type: opts.orderType,
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

  const cancelTrade = useCallback(
    async (tid: string) => {
      await delTradeMut.mutateAsync({ data: { id: tid } });
    },
    [delTradeMut],
  );

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

  const captureScreenshot = useCallback(
    async (dataUrl: string, caption?: string) => {
      if (!session || !user) return;
      try {
        const { path } = await uploadReplayScreenshot(user.id, session.id, dataUrl);
        await ssMut.mutateAsync({
          data: {
            session_id: session.id,
            storage_path: path,
            captured_ts: new Date(cursorTs).toISOString(),
            caption: caption ?? null,
          },
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
    notes: (query.data?.notes ?? []) as any,
    bookmarks: (query.data?.bookmarks ?? []) as any,
    checklist: (query.data?.checklist ?? []) as any,
    score: query.data?.score ?? null,
    screenshots: query.data?.screenshots ?? [],
    play, pause, toggle, restart, step, skip, setSpeed, setCursorIdx,
    openTrade, closeTrade, cancelTrade,
    addNote, removeNote, addBookmark, removeBookmark,
    toggleCheck, addCheck, captureScreenshot, finish,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
