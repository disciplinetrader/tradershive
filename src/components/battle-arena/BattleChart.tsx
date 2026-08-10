import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play, TrendingDown, TrendingUp } from "lucide-react";

import { usePaper } from "@/components/paper-trading/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter, PriceLineHandle } from "@/lib/chart/adapter";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import { INDICATOR_TOGGLES } from "@/lib/chart/indicator-registry";
import type { ChartSettings, IndicatorConfig } from "@/lib/chart/types";
import { placeOrEditOrder } from "@/lib/chart/orders/service";
import type { PositionOrder } from "@/lib/chart/orders/model";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { TIMEFRAME_SECONDS } from "@/lib/replay/constants";
import type { Candle, Timeframe } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

import { useBattleReplay } from "./battle-replay-context";

/**
 * The battle screen's chart.
 *
 * Purpose-built rather than adapted from `TradingWorkspace`, which carries a
 * live market feed, a workspace tab strip, companion panes and two competing
 * order lineages — none of which belong in a battle. This renders one thing:
 * the replayed tape, with one way to trade it.
 *
 * ── It cannot show live prices ─────────────────────────────────────────────
 *
 * Every candle comes from `useBattleReplay()`, which slices the battle's frozen
 * dataset at the server-derived cursor. Nothing here subscribes to
 * `marketData`, and there is no fallback path: no replay session means an empty
 * state, never a live chart. A battle silently rendering today's price while
 * competitors trade July's would be unfair in a way nobody would notice.
 *
 * ── One order path ─────────────────────────────────────────────────────────
 *
 * BUY/SELL place a market order directly into the replay session's own
 * `PositionOrderStore`. The engine fills it from the next observation, and the
 * resulting ClosedTrade lands in the session's `ClosedTradeStore` — which is
 * exactly what `BattleReplayProvider`'s recorder subscribes to. So a fill here
 * reaches `paper_trades` with its `observation_cursor`.
 *
 * The paper lineage (`OrderPanel` → `openTrade`) is deliberately not reachable
 * from this component. It prices at the live market, which in a replay battle
 * is the wrong market entirely.
 */

/** Default protective distances, as a fraction of the entry price. */
const STOP_PCT = 0.01;
const TARGET_PCT = 0.02;

const DISPLAY_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

/**
 * Resolve a design token to a concrete colour string.
 *
 * Price lines are painted onto a canvas by the charting library, which cannot
 * resolve `var(--token)` — it needs a real colour. The tokens are `oklch(...)`,
 * so wrapping them in `hsl()` produces an invalid value that fails silently.
 * Read the computed value instead, the same way the adapter itself does.
 */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Aggregate the dataset's bars into a coarser display timeframe.
 *
 * Display only — the engine always runs on the battle's own tape at its own
 * timeframe, because that tape is what `replay_dataset_id` checksums. Changing
 * what the trader looks at must never change what the market does.
 */
function aggregate(candles: Candle[], fromTf: Timeframe, toTf: Timeframe): Candle[] {
  const fromMs = TIMEFRAME_SECONDS[fromTf] * 1000;
  const toMs = TIMEFRAME_SECONDS[toTf] * 1000;
  if (toMs <= fromMs || candles.length === 0) return candles;

  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = 0;

  for (const c of candles) {
    const start = Math.floor(c.time / toMs) * toMs;
    if (!bucket || start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = { ...c, time: start };
      continue;
    }
    bucket = {
      time: bucket.time,
      open: bucket.open,
      high: Math.max(bucket.high, c.high),
      low: Math.min(bucket.low, c.low),
      close: c.close,
      volume: (bucket.volume ?? 0) + (c.volume ?? 0),
    };
  }
  if (bucket) out.push(bucket);
  return out;
}

export function BattleChart() {
  const replay = useBattleReplay();
  const { account } = usePaper();
  const { session, status, error, candles, progress, paused, setPaused } = replay;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const linesRef = useRef<PriceLineHandle[]>([]);

  const [displayTf, setDisplayTf] = useState<Timeframe | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState("0.10");
  const [orderError, setOrderError] = useState<string | null>(null);
  /** Bumped on every store emission so derived position state re-renders. */
  const [storeTick, setStoreTick] = useState(0);
  /** Bumped when the chart canvas attaches, so data effects re-run against it. */
  const [adapterTick, setAdapterTick] = useState(0);

  const symbol = session?.config.symbol ?? "";
  const market = session?.config.market ?? null;
  const datasetTf = (session?.config.timeframe ?? "5m") as Timeframe;
  const activeTf = displayTf ?? datasetTf;

  /**
   * Has the market opened yet?
   *
   * The route shows this screen for `ready` and `countdown` as well as `live`,
   * so the chart mounts before `start_at`. The cursor is derived from
   * `now - start_at` and floors at zero, which means a battle that has not
   * started renders exactly one bar at 0% — indistinguishable, at a glance,
   * from a broken tape. It said "0%" and a single candle and looked like a
   * failure, so it now says so in words instead.
   */
  const startMs = useMemo(() => {
    const raw = session?.config.startAt;
    if (raw == null) return null;
    return typeof raw === "number" ? raw : new Date(raw).getTime();
  }, [session]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const notStarted = startMs != null && nowMs < startMs;
  const secondsToStart = startMs != null ? Math.max(0, Math.ceil((startMs - nowMs) / 1000)) : 0;

  // ── the bars on screen ───────────────────────────────────────────────────
  // `candles` is already frozen by the provider while the viewer has engaged
  // FREEZE, so nothing here needs to know about that.
  const view = useMemo(
    () => (activeTf === datasetTf ? candles : aggregate(candles, datasetTf, activeTf)),
    [candles, activeTf, datasetTf],
  );

  /**
   * The price an order would actually fill near — read from the engine, not
   * from `view`. While frozen those differ, and the engine keeps advancing, so
   * validating an order against the frozen picture would derive stops from a
   * price that no longer exists.
   */
  const truePrice = useMemo(() => {
    if (!session) return null;
    const live = session.engine.clock.visibleCandles();
    return live.length ? live[live.length - 1].close : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, replay.cursor]);

  const displayPrice = view.length ? view[view.length - 1].close : null;

  const settings: ChartSettings = useMemo(
    () => ({
      ...DEFAULT_CHART_SETTINGS,
      symbol: symbol || DEFAULT_CHART_SETTINGS.symbol,
      market: (market ?? undefined) as ChartSettings["market"],
      timeframe: activeTf as ChartSettings["timeframe"],
      chartType: "candles",
      theme: "dark",
      showVolume: true,
      timezone: "UTC",
    }),
    [symbol, market, activeTf],
  );

  const indicators: IndicatorConfig[] = useMemo(
    () =>
      INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
        id: i.key,
        key: i.key,
        params: i.params,
        pane: i.pane,
        visible: true,
      })),
    [enabled],
  );

  // ── adapter lifecycle ────────────────────────────────────────────────────
  //
  // A callback ref, not a mount effect. This component renders an empty state
  // until the session resolves, so the host element does not exist on first
  // render — a `[]`-dep effect would run once against a null ref and never
  // mount the chart at all. The callback fires whenever the node attaches or
  // detaches, which is exactly the lifecycle the adapter needs.
  //
  // `settingsRef` keeps the callback identity stable: a ref that changes
  // identity on every render is detached and re-attached each time, which would
  // rebuild the chart continuously.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const attachChart = useCallback((node: HTMLDivElement | null) => {
    if (adapterRef.current) {
      linesRef.current = [];
      adapterRef.current.destroy();
      adapterRef.current = null;
    }
    hostRef.current = node;
    if (!node) return;
    adapterRef.current = createLightweightAdapter({
      container: node,
      settings: settingsRef.current,
    });
    setAdapterTick((n) => n + 1);
  }, []);

  useEffect(() => { adapterRef.current?.applySettings(settings); }, [settings]);

  // `adapterTick` is a dependency on purpose: the bars usually arrive before
  // the canvas exists, so these have to run again once it does.
  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !view.length) return;
    a.setCandles(view);
    a.setVolumeVisible(true, view);
  }, [view, adapterTick]);

  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !view.length) return;
    a.syncOverlayIndicators(indicators, view);
    a.syncSubPaneIndicators(indicators, view);
  }, [indicators, view, adapterTick]);

  // ── follow the session's order store ─────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const bump = () => setStoreTick((n) => n + 1);
    const offOrders = session.stores.orders.subscribe(bump);
    const offTrades = session.stores.trades?.subscribe(bump);
    bump();
    return () => {
      offOrders();
      offTrades?.();
    };
  }, [session]);

  const positions: PositionOrder[] = useMemo(
    () => (session ? session.stores.orders.positions() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, storeTick],
  );

  // ── position lines on the chart ──────────────────────────────────────────
  // Rebuilt wholesale rather than diffed: the set is tiny, and a diff is how
  // an orphaned line ends up pinned to a position that closed.
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    for (const line of linesRef.current) line.remove();
    linesRef.current = [];

    const up = token("--success", "#22c55e");
    const down = token("--danger", "#ef4444");

    for (const p of positions) {
      const long = p.direction === "buy";
      const entry = p.fillPrice ?? p.entry;
      linesRef.current.push(
        a.addPriceLine({
          price: entry,
          color: long ? up : down,
          title: `${long ? "LONG" : "SHORT"} ${p.size ?? ""}`.trim(),
          lineWidth: 2,
          axisLabelVisible: true,
        }),
        a.addPriceLine({ price: p.stop, color: down, title: "SL", lineStyle: 2, lineWidth: 1 }),
        a.addPriceLine({ price: p.target, color: up, title: "TP", lineStyle: 2, lineWidth: 1 }),
      );
    }
  }, [positions, adapterTick]);

  // ── P&L, from the engine ─────────────────────────────────────────────────
  // Engine arithmetic — `(exit − fill) × sign × quantity` — so these agree with
  // what the fill recorder will write, rather than being a second opinion.
  const unrealized = useMemo(() => {
    if (truePrice == null) return 0;
    return positions.reduce((sum, p) => {
      const entry = p.fillPrice ?? p.entry;
      const sign = p.direction === "buy" ? 1 : -1;
      return sum + (truePrice - entry) * sign * (p.size ?? 0);
    }, 0);
  }, [positions, truePrice]);

  const realized = useMemo(() => {
    if (!session?.stores.trades) return 0;
    return session.stores.trades.list().reduce((sum, t) => sum + (t.netPnl ?? 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, storeTick]);

  const balance = account ? Number(account.balance) : (session?.config.startingBalance ?? 0);

  // ── placing an order ─────────────────────────────────────────────────────
  const place = useCallback(
    (direction: "buy" | "sell") => {
      setOrderError(null);
      if (!session) return;

      // Before `start_at` the cursor is pinned at zero, so no observation is
      // ever emitted and a market order would rest as `pending` forever —
      // looking exactly like a button that does nothing. Refuse with a reason.
      if (notStarted) {
        setOrderError(`Market opens in ${secondsToStart}s.`);
        return;
      }

      const price = truePrice;
      if (price == null || !Number.isFinite(price)) {
        setOrderError("No market price yet.");
        return;
      }
      const size = Number(qty);
      if (!Number.isFinite(size) || size <= 0) {
        setOrderError("Quantity must be a positive number.");
        return;
      }

      const long = direction === "buy";
      const stop = long ? price * (1 - STOP_PCT) : price * (1 + STOP_PCT);
      const target = long ? price * (1 + TARGET_PCT) : price * (1 - TARGET_PCT);

      // A fresh drawingId per click: the store is idempotent *by drawing*, so
      // reusing one would edit the previous order instead of opening a second
      // position. No drawing exists under this id and none needs to — the
      // geometry sync is a no-op and the canonical order is what trades.
      const res = placeOrEditOrder(
        session.stores,
        {
          symbol,
          direction,
          orderType: "market",
          entry: price,
          stop,
          target,
          size,
          drawingId: `battle-${session.config.battleId}-${Date.now()}`,
        },
        { marketPrice: price, market },
      );

      // The order rests as `pending` for at most one advance tick (250ms) —
      // `triggersEntry` is unconditionally true for a market order, so the next
      // observation fills it.
      if (!res.ok) setOrderError(res.errors.join(" "));
    },
    [session, truePrice, qty, symbol, market, notStarted, secondsToStart],
  );

  const nudgeQty = (delta: number) => {
    const next = Math.max(0.01, Math.round((Number(qty) + delta) * 100) / 100);
    setQty(next.toFixed(2));
  };

  // ── empty states — never a live chart ────────────────────────────────────
  if (status !== "ready" || !session) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-8">
        <div className="max-w-md text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {status === "loading" ? "Loading the battle tape" : "No replay session"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ??
              (status === "loading"
                ? "Fetching the historical candles this battle was created against."
                : "This battle has no replay dataset, so there is nothing to render. It will not fall back to live prices.")}
          </p>
        </div>
      </div>
    );
  }

  const pct = Math.round(progress * 100);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* ── toolbar ───────────────────────────────────────────────────── */}
      <div className="relative flex h-11 shrink-0 items-center gap-3 border-b border-border/40 bg-card/20 px-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-black uppercase tracking-tight">{symbol}</span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {displayPrice != null ? displayPrice.toFixed(2) : "—"}
          </span>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-card/40 p-0.5">
          {DISPLAY_TIMEFRAMES.map((tf) => {
            // Below the dataset's own timeframe there is nothing to build a bar
            // from — the tape simply does not contain that detail.
            const tooFine = TIMEFRAME_SECONDS[tf] < TIMEFRAME_SECONDS[datasetTf];
            return (
              <button
                key={tf}
                disabled={tooFine}
                onClick={() => setDisplayTf(tf)}
                title={tooFine ? `This battle's tape is ${datasetTf}` : undefined}
                className={cn(
                  "h-7 rounded-md px-2 text-[11px] font-bold uppercase transition-colors",
                  tf === activeTf
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  tooFine && "cursor-not-allowed opacity-30 hover:bg-transparent",
                )}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] font-bold uppercase">
              Indicators
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest">
              Indicators
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {INDICATOR_TOGGLES.map((i) => (
              <DropdownMenuCheckboxItem
                key={i.key}
                checked={!!enabled[i.key]}
                onCheckedChange={(v) => setEnabled((s) => ({ ...s, [i.key]: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                {i.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── replay controls, centred over the chart ─────────────────── */}
        {/* No scrubber handle, no speed, no skip: the cursor is server-derived
            and shared, so anything that moved it would only desynchronise this
            viewer from the battle. FREEZE stops this chart, never the market. */}
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 px-3 py-1 backdrop-blur">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Replay
            </span>
            {notStarted ? (
              <span className="font-mono text-[11px] font-bold tabular-nums text-warning">
                Market opens in {Math.floor(secondsToStart / 60)}:
                {String(secondsToStart % 60).padStart(2, "0")}
              </span>
            ) : (
              <>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {pct}%
                </span>
                <button
                  onClick={() => setPaused(!paused)}
                  title={paused ? "Resume this chart" : "Freeze this chart (the market keeps moving)"}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-black uppercase transition-colors",
                    paused
                      ? "bg-warning/15 text-warning"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {paused ? "Frozen" : "Freeze"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── the chart ─────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <div ref={attachChart} className="absolute inset-0" />
        {notStarted && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-widest text-warning">
                Waiting for the bell
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {Math.floor(secondsToStart / 60)}:{String(secondsToStart % 60).padStart(2, "0")}
              </p>
              <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                The tape does not move until the battle starts, so only the opening
                bar is on screen. Orders are refused until then.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── order bar ─────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-border/40 bg-card/30 px-3">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => place("buy")}
            disabled={notStarted}
            title={notStarted ? "The market has not opened yet" : undefined}
            size="sm"
            className="h-9 rounded-full bg-success px-5 text-xs font-black uppercase text-background hover:bg-success/90"
          >
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
            Buy
          </Button>
          <Button
            onClick={() => place("sell")}
            disabled={notStarted}
            title={notStarted ? "The market has not opened yet" : undefined}
            size="sm"
            className="h-9 rounded-full bg-danger px-5 text-xs font-black uppercase text-background hover:bg-danger/90"
          >
            <TrendingDown className="mr-1.5 h-3.5 w-3.5" />
            Sell
          </Button>

          <div className="ml-1 flex h-9 items-center overflow-hidden rounded-lg border border-border/40 bg-card/40">
            <button
              onClick={() => nudgeQty(-0.01)}
              className="h-full w-7 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              −
            </button>
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Quantity"
              className="h-full w-16 border-none bg-transparent p-0 text-center font-mono text-xs font-bold focus-visible:ring-0"
            />
            <button
              onClick={() => nudgeQty(0.01)}
              className="h-full w-7 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              +
            </button>
          </div>

          {orderError && (
            <span className="max-w-xs truncate text-[11px] font-medium text-danger" title={orderError}>
              {orderError}
            </span>
          )}
          {positions.length > 0 && (
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {positions.length} open
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          <Stat label="Balance" value={formatCurrency(balance)} />
          <Stat label="Realized P/L" value={formatCurrency(realized)} signed={realized} />
          <Stat label="Unrealized P/L" value={formatCurrency(unrealized)} signed={unrealized} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-bold tabular-nums",
          signed === undefined ? "text-foreground" : signed >= 0 ? "text-success" : "text-danger",
        )}
      >
        {signed !== undefined && signed > 0 ? "+" : ""}
        {value}
      </span>
    </div>
  );
}
