/**
 * Multi-chart layouts for the Trading Workspace.
 *
 * Slot 0 is always the *primary* chart — the one wired into Paper Trading
 * (order lines, planner, drawings, SL/TP handles). Slots 1-3 are lightweight
 * companion charts for multi-timeframe / multi-symbol context.
 *
 * The active slot is what the Watchlist targets: click a symbol and it lands
 * on whichever pane is focused, exactly like TradingView's chart grid.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChartType } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/market-data/types";

export type ChartLayoutKey = "1" | "2v" | "2h" | "3" | "4";

export type ChartPane = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  /** Follow the primary chart's symbol (multi-timeframe mode). */
  syncSymbol: boolean;
  /** Per-cell indicators, keyed by registry key. Independent of the primary. */
  indicators?: Record<string, boolean>;
  /** Per-cell volume sub-pane. */
  showVolume?: boolean;
};


export const CHART_LAYOUTS: {
  key: ChartLayoutKey;
  label: string;
  slots: number;
  gridClass: string;
}[] = [
  { key: "1", label: "Single chart", slots: 1, gridClass: "grid-cols-1 grid-rows-1" },
  { key: "2v", label: "Two columns", slots: 2, gridClass: "grid-cols-2 grid-rows-1" },
  { key: "2h", label: "Two rows", slots: 2, gridClass: "grid-cols-1 grid-rows-2" },
  { key: "3", label: "Three columns", slots: 3, gridClass: "grid-cols-3 grid-rows-1" },
  { key: "4", label: "Four charts", slots: 4, gridClass: "grid-cols-2 grid-rows-2" },
];

export function layoutSlots(key: ChartLayoutKey): number {
  return CHART_LAYOUTS.find((l) => l.key === key)?.slots ?? 1;
}

export function layoutGridClass(key: ChartLayoutKey): string {
  return CHART_LAYOUTS.find((l) => l.key === key)?.gridClass ?? "grid-cols-1 grid-rows-1";
}

/** Companion timeframes seeded when a new pane appears. */
const SEED_TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H"];

const STORAGE_KEY = "th.chart.layout.v1";

type Persisted = { layout: ChartLayoutKey; panes: ChartPane[] };

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || !Array.isArray(parsed.panes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(value: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

function makePane(index: number, symbol: string, chartType: ChartType): ChartPane {
  return {
    id: `pane-${index}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    timeframe: SEED_TIMEFRAMES[Math.min(index, SEED_TIMEFRAMES.length - 1)],
    chartType,
    syncSymbol: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

export type ChartLayoutValue = {
  layout: ChartLayoutKey;
  setLayout: (key: ChartLayoutKey) => void;
  /** Companion panes only — slot 0 is the primary chart. */
  panes: ChartPane[];
  updatePane: (id: string, patch: Partial<ChartPane>) => void;
  /** 0 = primary chart, 1..n = companion pane index. */
  activeSlot: number;
  setActiveSlot: (slot: number) => void;
  /** Routes a symbol pick to whichever slot is focused. */
  sendSymbolToActiveSlot: (symbol: string) => void;
  /** Symbol currently displayed in a slot, for highlighting the watchlist. */
  slotSymbols: string[];
  /** Swap a companion pane into the primary slot. */
  promotePane: (id: string) => void;
  enabled: boolean;
};

const noop = () => {};

const ChartLayoutContext = createContext<ChartLayoutValue>({
  layout: "1",
  setLayout: noop,
  panes: [],
  updatePane: noop,
  activeSlot: 0,
  setActiveSlot: noop,
  sendSymbolToActiveSlot: noop,
  slotSymbols: [],
  promotePane: noop,
  enabled: false,
});

export function useChartLayout(): ChartLayoutValue {
  return useContext(ChartLayoutContext);
}

export function ChartLayoutProvider({
  children,
  primarySymbol,
  onPrimarySymbol,
  defaultChartType,
}: {
  children: ReactNode;
  primarySymbol: string;
  onPrimarySymbol: (symbol: string) => void;
  defaultChartType: ChartType;
}) {
  const [layout, setLayoutState] = useState<ChartLayoutKey>("1");
  const [panes, setPanes] = useState<ChartPane[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Restore the saved layout after mount so SSR markup stays stable.
  useEffect(() => {
    const saved = readPersisted();
    if (saved) {
      setLayoutState(saved.layout);
      setPanes(saved.panes);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writePersisted({ layout, panes });
  }, [hydrated, layout, panes]);

  const setLayout = useCallback(
    (key: ChartLayoutKey) => {
      const needed = layoutSlots(key) - 1;
      setPanes((prev) => {
        if (prev.length === needed) return prev;
        if (prev.length > needed) return prev.slice(0, needed);
        const next = [...prev];
        while (next.length < needed) next.push(makePane(next.length, primarySymbol, defaultChartType));
        return next;
      });
      setActiveSlot((slot) => Math.min(slot, layoutSlots(key) - 1));
      setLayoutState(key);
    },
    [primarySymbol, defaultChartType],
  );

  const updatePane = useCallback((id: string, patch: Partial<ChartPane>) => {
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const sendSymbolToActiveSlot = useCallback(
    (symbol: string) => {
      if (activeSlot === 0) {
        onPrimarySymbol(symbol);
        return;
      }
      const pane = panes[activeSlot - 1];
      if (!pane) {
        onPrimarySymbol(symbol);
        return;
      }
      updatePane(pane.id, { symbol, syncSymbol: false });
    },
    [activeSlot, panes, onPrimarySymbol, updatePane],
  );

  const promotePane = useCallback(
    (id: string) => {
      const pane = panes.find((p) => p.id === id);
      if (!pane) return;
      const previousPrimary = primarySymbol;
      onPrimarySymbol(pane.symbol);
      updatePane(id, { symbol: previousPrimary, syncSymbol: false });
      setActiveSlot(0);
    },
    [panes, primarySymbol, onPrimarySymbol, updatePane],
  );

  const slotSymbols = useMemo(
    () => [primarySymbol, ...panes.map((p) => (p.syncSymbol ? primarySymbol : p.symbol))],
    [primarySymbol, panes],
  );

  const value = useMemo<ChartLayoutValue>(
    () => ({
      layout,
      setLayout,
      panes,
      updatePane,
      activeSlot,
      setActiveSlot,
      sendSymbolToActiveSlot,
      slotSymbols,
      promotePane,
      enabled: true,
    }),
    [layout, setLayout, panes, updatePane, activeSlot, sendSymbolToActiveSlot, slotSymbols, promotePane],
  );

  return <ChartLayoutContext.Provider value={value}>{children}</ChartLayoutContext.Provider>;
}
