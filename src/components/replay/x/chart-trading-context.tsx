/**
 * REPLAY STUDIO X — Phase 2 · Chart trading state.
 *
 * Owns the *interaction* state for chart-native order entry: the armed
 * draft order, which position is selected, and the busy flag while an
 * action is in flight. It deliberately owns **no execution logic** — every
 * mutation is delegated to the existing replay context actions
 * (`openTrade`, `modifyTrade`, `closeTrade`, `partialClose`,
 * `moveToBreakEven`, `reversePosition`), so the engine, risk rules and
 * analytics pipelines behave exactly as they did with the TradePanel.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useReplay } from "../context";
import {
  averageRange,
  defaultStops,
  inferOrderType,
  validateDraft,
  type ChartSide,
  type DraftOrder,
  type LevelKind,
} from "@/lib/replay/chart-trading";
import type { OrderType } from "@/lib/replay/types";

type ChartTradingCtx = {
  /** Live mid price of the revealed candle. */
  price: number;
  /** Typical bar range — the unit used for default stops and fine steps. */
  unit: number;
  draft: DraftOrder | null;
  busy: boolean;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Arm a draft on `side` (B / S / ticket buttons). Re-arming flips side. */
  arm: (side: ChartSide) => void;
  /** Arm a draft with the entry pinned at an arbitrary chart price. */
  armAt: (side: ChartSide, entry: number) => void;
  patchDraft: (patch: Partial<DraftOrder>) => void;
  /** Move one draft level; auto-updates the order type for entry moves. */
  moveLevel: (kind: LevelKind, price: number) => void;
  setOrderType: (t: OrderType) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
};

const Ctx = createContext<ChartTradingCtx | null>(null);

export function useChartTrading() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChartTrading must be used within ChartTradingProvider");
  return v;
}

export function useOptionalChartTrading() {
  return useContext(Ctx);
}

export function ChartTradingProvider({ children }: { children: ReactNode }) {
  const { candles, cursorIdx, openTrade, settings } = useReplay();
  const [draft, setDraft] = useState<DraftOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const price = candles[cursorIdx]?.close ?? 0;
  const unit = useMemo(() => averageRange(candles, cursorIdx), [candles, cursorIdx]);

  const priceRef = useRef(price);
  priceRef.current = price;
  const unitRef = useRef(unit);
  unitRef.current = unit;

  const buildDraft = useCallback(
    (side: ChartSide, entry: number): DraftOrder => {
      const u = unitRef.current;
      const { sl, tp } = defaultStops(side, entry, u);
      return {
        side,
        orderType: inferOrderType(side, entry, priceRef.current, u),
        typePinned: false,
        entry,
        sl,
        tp,
        lot: settings.defaultLotSize > 0 ? settings.defaultLotSize : 1,
      };
    },
    [settings.defaultLotSize],
  );

  const arm = useCallback(
    (side: ChartSide) => {
      const p = priceRef.current;
      if (!p) {
        toast.error("No price yet — wait for candles to load.");
        return;
      }
      setDraft((prev) => (prev && prev.side === side ? null : buildDraft(side, p)));
    },
    [buildDraft],
  );

  const armAt = useCallback(
    (side: ChartSide, entry: number) => {
      if (!Number.isFinite(entry) || entry <= 0) return;
      setDraft(buildDraft(side, entry));
    },
    [buildDraft],
  );

  const patchDraft = useCallback((patch: Partial<DraftOrder>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const moveLevel = useCallback((kind: LevelKind, next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (kind === "entry") {
        const shift = next - prev.entry;
        return {
          ...prev,
          entry: next,
          // Levels travel with the entry so the R:R the trader shaped is kept.
          sl: prev.sl != null ? prev.sl + shift : null,
          tp: prev.tp != null ? prev.tp + shift : null,
          orderType: prev.typePinned
            ? prev.orderType
            : inferOrderType(prev.side, next, priceRef.current, unitRef.current),
        };
      }
      if (kind === "sl") return { ...prev, sl: next };
      return { ...prev, tp: next };
    });
  }, []);

  const setOrderType = useCallback((t: OrderType) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const entry = t === "market" ? priceRef.current : prev.entry;
      const shift = entry - prev.entry;
      return {
        ...prev,
        orderType: t,
        typePinned: t !== "market",
        entry,
        sl: prev.sl != null ? prev.sl + shift : null,
        tp: prev.tp != null ? prev.tp + shift : null,
      };
    });
  }, []);

  const cancel = useCallback(() => setDraft(null), []);

  const confirm = useCallback(async () => {
    if (!draft || inFlight.current) return;
    const check = validateDraft(draft);
    if (!check.ok) {
      toast.error(check.reason ?? "Order is not valid");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await openTrade({
        direction: draft.side,
        orderType: draft.orderType,
        lotSize: draft.lot,
        stopLoss: draft.sl,
        takeProfit: draft.tp,
        entryPrice: draft.orderType === "market" ? null : draft.entry,
      });
      setDraft(null);
    } catch {
      toast.error("Order could not be placed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [draft, openTrade]);

  const value = useMemo<ChartTradingCtx>(
    () => ({
      price,
      unit,
      draft,
      busy,
      selectedId,
      select: setSelectedId,
      arm,
      armAt,
      patchDraft,
      moveLevel,
      setOrderType,
      cancel,
      confirm,
    }),
    [price, unit, draft, busy, selectedId, arm, armAt, patchDraft, moveLevel, setOrderType, cancel, confirm],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
